import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SleepRecorder, preferredRecordingMime } from '../dist/recording.js';

function rig({ deferredPermission = false, denyPermission = false, failStorage = false } = {}) {
  let currentTime = 100000, amplitude = 0, resolvePermission;
  const jobs = new Map(); let timerId = 0;
  const env = new EventTarget();
  const document = new EventTarget(); document.visibilityState = 'visible';
  const track = new EventTarget(); track.stopped = false; track.stop = () => { track.stopped = true; };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const records = new Map(), clips = new Map(), statuses = [], levels = [], errors = [], captured = [];
  class Audio extends EventTarget {
    constructor() { super(); this.state = 'running'; }
    async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
    async close() { this.state = 'closed'; this.closed = true; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { const analyser = { fftSize: 2048, getFloatTimeDomainData(data) { data.fill(amplitude); } }; env.lastAnalyser = analyser; return analyser; }
  }
  class Recorder extends EventTarget {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    constructor(stream, options) { super(); this.state = 'inactive'; this.mimeType = options.mimeType; env.lastRecorderOptions = options; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const event = new Event('dataavailable'); event.data = new Blob(['local test audio bytes'], { type: this.mimeType });
      this.dispatchEvent(event); this.dispatchEvent(new Event('stop'));
    }
  }
  Object.assign(env, {
    document, navigator: { mediaDevices: { getUserMedia: async constraints => {
      env.permissionCalls = (env.permissionCalls || 0) + 1;
      env.lastConstraints = constraints;
      if (denyPermission) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      if (deferredPermission) return new Promise(resolve => { resolvePermission = resolve; });
      return stream;
    } } },
    AudioContext: Audio, MediaRecorder: Recorder, Blob, console,
    intervalDelays: [],
    setInterval(callback, delay) { env.intervalDelays.push(delay); const id = ++timerId; jobs.set(id, callback); return id; },
    clearInterval(id) { jobs.delete(id); },
    setTimeout(callback) { const id = ++timerId; jobs.set(id, callback); return id; },
    clearTimeout(id) { jobs.delete(id); }
  });
  const storage = {
    async getSession(id) { return records.get(id) || null; },
    async listClips(id) { return [...clips.values()].filter(c => c.sessionId === id); },
    async putSession(record) { records.set(record.id, structuredClone(record)); return record; },
    async storeClip(clip) {
      if (failStorage) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      const saved = { ...clip, id: `test-${clips.size}`, bytes: clip.blob.size, mimeType: clip.blob.type };
      clips.set(saved.id, saved); return saved;
    }
  };
  const recorder = new SleepRecorder({ storage, environment: env, now: () => currentTime,
    onStatus: status => statuses.push(status), onLevel: level => levels.push(level), onError: error => errors.push(error), onClip: clip => captured.push(clip) });
  return {
    recorder, env, track, records, clips, statuses, levels, errors, captured, jobs,
    advance(ms) { currentTime += ms; },
    setLevel(value) { amplitude = value; },
    resolvePermission() { resolvePermission(stream); }
  };
}

test('prefers a Safari-compatible MIME, without claiming unsupported types', () => {
  assert.equal(preferredRecordingMime(class { static isTypeSupported(t) { return t === 'audio/mp4'; } }), 'audio/mp4');
  assert.equal(preferredRecordingMime(class { static isTypeSupported() { return false; } }), '');
  assert.equal(preferredRecordingMime(null), null);
});

test('requests microphone only on start, saves loud events locally, stops tracks and timers', async () => {
  const r = rig();
  assert.equal(r.env.permissionCalls, undefined);
  await r.recorder.start({ sessionId: 'night-1', threshold: 0.02 });
  assert.equal(r.env.permissionCalls, 1);
  r.recorder._sample(); assert.equal(r.recorder.recorder, undefined);
  r.setLevel(0.08); r.recorder._sample(); r.advance(100); r.recorder._sample();
  assert.equal(r.recorder.recorder.state, 'recording');
  r.advance(2500);
  const summary = await r.recorder.stop();
  assert.equal(summary.status, 'stopped'); assert.equal(summary.clipCount, 1);
  assert.equal(r.captured[0].classification, 'unclassified');
  assert.equal(r.captured[0].type, 'sound-event'); assert.equal(r.captured[0].blob, undefined);
  assert.equal(r.clips.get('test-0').blob.type, 'audio/mp4');
  assert.equal(r.track.stopped, true); assert.equal(r.jobs.size, 0);
  assert.equal(r.levels.at(-1).rms, 0);
});

test('permission rejection reports an actionable error and leaves no capture running', async () => {
  const r = rig({ denyPermission: true });
  await assert.rejects(r.recorder.start({ sessionId: 'night-2' }), { name: 'NotAllowedError' });
  assert.equal(r.recorder.state, 'error'); assert.equal(r.jobs.size, 0);
  assert.match(r.errors[0].message, /permission was not granted/);
  assert.equal(r.records.get('night-2').status, 'error');
});

test('stopping during a pending permission request never starts capture later', async () => {
  const r = rig({ deferredPermission: true });
  const starting = r.recorder.start({ sessionId: 'night-3' });
  while (!r.env.permissionCalls) await new Promise(resolve => setImmediate(resolve));
  await r.recorder.stop();
  r.resolvePermission();
  assert.equal(await starting, null);
  assert.equal(r.track.stopped, true); assert.equal(r.recorder.context, null);
  assert.equal(r.recorder.state, 'stopped'); assert.equal(r.jobs.size, 0);
});

test('records visibility as uncertain and actual audio suspension as an interruption; resume is explicit', async () => {
  const r = rig(); await r.recorder.start({ sessionId: 'night-4' });
  r.env.document.visibilityState = 'hidden'; r.env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(r.recorder.session.gaps[0].kind, 'potential');
  r.advance(2000); r.env.document.visibilityState = 'visible'; r.env.document.dispatchEvent(new Event('visibilitychange'));
  const context = r.recorder.context; context.state = 'suspended'; context.dispatchEvent(new Event('statechange'));
  assert.equal(r.recorder.state, 'interrupted');
  assert.equal(r.env.permissionCalls, 1);
  assert.equal(await r.recorder.resume(), true); assert.equal(r.env.permissionCalls, 1);
  const summary = await r.recorder.stop();
  assert.ok(summary.gaps.every(gap => gap.end !== null));
  assert.equal(summary.gaps.find(g => g.reason === 'audio-suspended').kind, 'observed');
});

test('clip count limit releases the microphone rather than recording indefinitely', async () => {
  const r = rig(); await r.recorder.start({ sessionId: 'night-5', maxClips: 1 });
  r.setLevel(0.1); r.recorder._sample(); r.advance(100); r.recorder._sample(); r.advance(10001); r.recorder._sample();
  while (r.recorder.state !== 'stopped') await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.track.stopped, true); assert.equal(r.clips.size, 1);
  assert.equal(r.records.get('night-5').stopReason, 'clip-limit');
  assert.equal(r.jobs.size, 0);
});

test('storage quota failure stops capture and keeps the event unclassified', async () => {
  const r = rig({ failStorage: true }); await r.recorder.start({ sessionId: 'night-6' });
  r.setLevel(0.1); r.recorder._sample(); r.advance(100); r.recorder._sample(); r.advance(10001); r.recorder._sample();
  while (r.recorder.state !== 'stopped') await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.track.stopped, true); assert.equal(r.clips.size, 0);
  assert.match(r.errors[0].message, /storage is full/);
  assert.equal(r.records.get('night-6').status, 'interrupted');
});

test('battery-saving options use a slower sample loop, smaller analyser, requested low sample rate and lower encoder bitrate', async () => {
  const r = rig();
  await r.recorder.start({ sessionId: 'night-saver', sampleIntervalMs: 500, fftSize: 512, audioBitsPerSecond: 24000 });
  assert.equal(r.env.intervalDelays[0], 500);
  assert.equal(r.env.lastAnalyser.fftSize, 512);
  assert.equal(r.recorder.samples.length, 512);
  assert.deepEqual(r.env.lastConstraints.audio.sampleRate, { ideal: 16000 });
  r.setLevel(0.1); r.recorder._sample(); r.advance(500); r.recorder._sample();
  assert.equal(r.env.lastRecorderOptions.audioBitsPerSecond, 24000);
  r.advance(2000); await r.recorder.stop();
  assert.equal(r.track.stopped, true); assert.equal(r.jobs.size, 0);
  assert.equal(r.records.get('night-saver').captureOptions.audioBitsPerSecond, 24000);
  assert.equal(r.records.get('night-saver').actualSampleRate, null);
});

test('intentional pause followed by restart preserves the missing-coverage interval', async () => {
  const r = rig();
  await r.recorder.start({ sessionId: 'night-pause' });
  r.advance(60000);
  const stopped = await r.recorder.stop({ reason: 'user-pause' });
  assert.equal(stopped.status, 'interrupted');
  const pausedAt = stopped.end;
  r.advance(120000);
  await r.recorder.start({ sessionId: 'night-pause' });
  const gap = r.recorder.session.gaps.find(g => g.reason === 'user-paused');
  assert.deepEqual(gap, { reason: 'user-paused', kind: 'observed', start: pausedAt, end: pausedAt + 120000 });
  assert.equal(r.env.permissionCalls, 2);
  await r.recorder.stop();
  assert.equal(r.jobs.size, 0);
  assert.equal(r.records.get('night-pause').gaps.length, 1);
});
