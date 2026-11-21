import * as localAudio from './storage.js';

export function preferredRecordingMime(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) return null;
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (!MediaRecorderClass.isTypeSupported) return '';
  return candidates.find(type => MediaRecorderClass.isTypeSupported(type)) || '';
}

function problem(error) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Microphone permission was not granted. Enable it for this site and try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone is available on this device.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The microphone is busy or unavailable. Close other recording apps and retry.';
  if (name === 'QuotaExceededError') return 'Local audio storage is full. Export or remove older recordings before continuing.';
  return error?.message || 'Sound monitoring could not continue.';
}

/**
 * Local, threshold-based sound-event recorder. It does not identify snoring,
 * speech, sleep stages or sleep quality. Call start() from a user gesture.
 * onStatus receives {state, sessionId, clips, bytes, reason?}; onClip receives
 * saved clip metadata (no Blob). User audio is never uploaded.
 */
export class SleepRecorder {
  constructor({ onStatus, onLevel, onClip, onError, storage = localAudio, environment = globalThis, now = () => Date.now() } = {}) {
    this.callbacks = { onStatus, onLevel, onClip, onError };
    this.storage = storage;
    this.env = environment;
    this.now = now;
    this.state = 'idle';
    this._writeChain = Promise.resolve();
    this._clipCount = 0;
    this._bytes = 0;
    this._activeGaps = new Map();
    this._listeners = [];
    this._generation = 0;
  }

  _notify(name, value) {
    try { this.callbacks[name]?.(value); } catch (error) { this.env.console?.error?.('Recorder callback failed', error); }
  }
  _status(state, extra = {}) {
    this.state = state;
    this._notify('onStatus', { state, sessionId: this.session?.id ?? null, clips: this._clipCount, bytes: this._bytes, ...extra });
  }
  _error(error) {
    const result = error instanceof Error ? error : new Error(problem(error));
    this._notify('onError', { name: error?.name || 'Error', message: problem(error), error: result });
  }
  _listen(target, name, callback) {
    target?.addEventListener?.(name, callback);
    this._listeners.push(() => target?.removeEventListener?.(name, callback));
  }
  _persist() {
    if (!this.session) return Promise.resolve();
    const snapshot = { ...this.session, clipCount: this._clipCount, bytes: this._bytes, gaps: this.session.gaps.map(gap => ({ ...gap })) };
    this._writeChain = this._writeChain.catch(() => {}).then(() => this.storage.putSession(snapshot));
    return this._writeChain;
  }
  _gap(reason, kind = 'observed') {
    if (!this.session || this._activeGaps.has(reason)) return;
    const gap = { reason, kind, start: this.now(), end: null };
    this.session.gaps.push(gap);
    this._activeGaps.set(reason, gap);
    this._persist().catch(error => this._error(error));
  }
  _closeGap(reason) {
    const gap = this._activeGaps.get(reason);
    if (!gap) return;
    gap.end = this.now();
    this._activeGaps.delete(reason);
    this._persist().catch(error => this._error(error));
  }

  async start({ sessionId, threshold = 0.025, maxClipMs = 10000, maxClips = 50, maxBytes = 25 * 1024 * 1024, silenceMs = 1500, minimumClipMs = 1500, cooldownMs = 2500, sampleIntervalMs = 250, fftSize = 1024, audioBitsPerSecond = 32000 } = {}) {
    if (!['idle', 'stopped', 'error'].includes(this.state)) throw new Error('Sound monitoring is already active.');
    if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('A session ID is required.');
    const AudioContextClass = this.env.AudioContext || this.env.webkitAudioContext;
    if (!this.env.navigator?.mediaDevices?.getUserMedia || !this.env.MediaRecorder || !AudioContextClass) {
      throw new Error('Microphone recording is unavailable. Use a current browser on HTTPS.');
    }
    const token = ++this._generation;
    this.options = {
      threshold: Math.max(0.005, Math.min(0.5, Number(threshold) || 0.025)),
      maxClipMs: Math.max(1000, Math.min(30000, Number(maxClipMs) || 10000)),
      maxClips: Math.max(1, Math.min(200, Number(maxClips) || 50)),
      maxBytes: Math.max(1024, Math.min(100 * 1024 * 1024, Number(maxBytes) || 25 * 1024 * 1024)),
      silenceMs: Math.max(250, Number(silenceMs) || 1500),
      minimumClipMs: Math.max(250, Number(minimumClipMs) || 1500),
      cooldownMs: Math.max(0, Number(cooldownMs) || 0),
      sampleIntervalMs: Math.round(Math.max(100, Math.min(1000, Number(sampleIntervalMs) || 250))),
      fftSize: [512, 1024, 2048].includes(Number(fftSize)) ? Number(fftSize) : 1024,
      audioBitsPerSecond: Math.round(Math.max(16000, Math.min(64000, Number(audioBitsPerSecond) || 32000)))
    };
    this._status('requesting');
    let acquired;
    try {
      const previous = await this.storage.getSession(sessionId);
      const priorClips = await this.storage.listClips(sessionId);
      if (token !== this._generation) return null;
      this._clipCount = priorClips.length;
      this._bytes = priorClips.reduce((sum, clip) => sum + (clip.bytes || 0), 0);
      if (this._clipCount >= this.options.maxClips || this._bytes >= this.options.maxBytes) throw new Error('This session has reached its recording storage limit. Start a new session or remove older clips.');
      this.session = { ...previous, id: sessionId, start: previous?.start ?? this.now(), end: null, status: 'requesting', gaps: previous?.gaps?.map(gap => ({ ...gap })) || [], threshold: this.options.threshold };
      // A deliberate pause is known missing coverage, unlike hidden-page uncertainty.
      if (previous?.stopReason === 'user-pause' && Number.isFinite(previous.end)) {
        this.session.gaps.push({ reason: 'user-paused', kind: 'observed', start: previous.end, end: this.now() });
      }
      await this._persist();
      if (token !== this._generation) return null;
      // This is the only permission request, reached only after caller opt-in.
      acquired = await this.env.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: { ideal: 16000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (token !== this._generation) { acquired.getTracks().forEach(track => track.stop()); return null; }
      this.stream = acquired;
      this.context = new AudioContextClass();
      await this.context.resume();
      if (token !== this._generation) { await this._release(); return null; }
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.options.fftSize;
      this.source.connect(this.analyser);
      this.samples = new Float32Array(this.analyser.fftSize);
      this.mimeType = preferredRecordingMime(this.env.MediaRecorder);
      this._loudFrames = 0;
      this._quietSince = null;
      this._nextClipAt = 0;
      this._activeGaps.clear();
      this.session.status = 'monitoring';
      this.session.monitoringStartedAt = this.now();
      this.session.captureOptions = { sampleIntervalMs: this.options.sampleIntervalMs, fftSize: this.options.fftSize, audioBitsPerSecond: this.options.audioBitsPerSecond, requestedSampleRate: 16000 };
      // The browser/hardware can ignore the ideal sample rate or encoder bitrate.
      this.session.actualSampleRate = this.stream.getAudioTracks()[0]?.getSettings?.().sampleRate ?? null;
      await this._persist();
      this._wireInterruptions();
      this._status('monitoring');
      this.sampleTimer = this.env.setInterval(() => this._sample(), this.options.sampleIntervalMs);
      return { ...this.session };
    } catch (error) {
      // A pending permission prompt may resolve after stop(). Never revive it.
      if (token !== this._generation) { acquired?.getTracks().forEach(track => track.stop()); return null; }
      await this._release();
      if (this.session) {
        this.session.status = 'error'; this.session.end = this.now(); this.session.stopReason = 'start-error';
        await this._persist().catch(() => {});
      }
      this._status('error', { reason: 'start-error' });
      this._error(error);
      throw error;
    }
  }

  _wireInterruptions() {
    this._listen(this.env.document, 'visibilitychange', () => {
      if (this.env.document.visibilityState === 'hidden') {
        // Visibility alone does not prove a recording gap; preserve uncertainty.
        this._gap('page-hidden', 'potential');
        this._notify('onStatus', { state: this.state, sessionId: this.session.id, clips: this._clipCount, bytes: this._bytes, reason: 'background-may-pause' });
      } else this._closeGap('page-hidden');
    });
    this._listen(this.env, 'pagehide', () => { this._gap('page-unloaded'); void this.stop({ reason: 'page-unloaded' }); });
    this._listen(this.context, 'statechange', () => {
      if (!this.context || ['stopping', 'stopped', 'error'].includes(this.state)) return;
      if (this.context.state !== 'running') { this._gap('audio-suspended'); this._status('interrupted', { reason: 'audio-suspended' }); }
      else { this._closeGap('audio-suspended'); this._status('monitoring'); }
    });
    for (const track of this.stream.getAudioTracks()) {
      this._listen(track, 'ended', () => { this._gap('microphone-ended'); void this.stop({ reason: 'microphone-ended' }); });
      this._listen(track, 'mute', () => { this._gap('microphone-muted'); this._status('interrupted', { reason: 'microphone-muted' }); });
      this._listen(track, 'unmute', () => { this._closeGap('microphone-muted'); if (this.context?.state === 'running') this._status('monitoring'); });
    }
  }

  async resume() {
    if (!this.context || !['monitoring', 'interrupted'].includes(this.state)) return false;
    try {
      await this.context.resume();
      if (this.context.state === 'running') { this._closeGap('audio-suspended'); this._status('monitoring'); return true; }
      return false;
    } catch (error) { this._error(error); return false; }
  }

  setThreshold(value) {
    if (this.options) this.options.threshold = Math.max(0.005, Math.min(0.5, Number(value) || 0.025));
  }

  _sample() {
    if (!this.analyser || !['monitoring', 'interrupted'].includes(this.state) || this.context?.state !== 'running') return;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
    const now = this.now();
    this._notify('onLevel', { rms, threshold: this.options.threshold, recording: !!this.recorder, at: now });
    if (this.recorder) {
      this._clipPeak = Math.max(this._clipPeak, rms);
      if (rms < this.options.threshold * 0.65) this._quietSince ??= now;
      else this._quietSince = null;
      if ((now - this._clipStart >= this.options.minimumClipMs && this._quietSince !== null && now - this._quietSince >= this.options.silenceMs) || now - this._clipStart >= this.options.maxClipMs) this._stopClip();
      return;
    }
    if (this._clipPromise || now < this._nextClipAt || this.state !== 'monitoring') return;
    this._loudFrames = rms >= this.options.threshold ? this._loudFrames + 1 : 0;
    if (this._loudFrames >= 2) this._beginClip(rms);
  }

  _beginClip(level) {
    if (this.recorder || this._clipPromise || this.state !== 'monitoring') return;
    const chunks = [];
    let recorder;
    try { recorder = new this.env.MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType, audioBitsPerSecond: this.options.audioBitsPerSecond } : { audioBitsPerSecond: this.options.audioBitsPerSecond }); }
    catch (error) { this._error(error); void this.stop({ reason: 'recorder-error' }); return; }
    this.recorder = recorder;
    this._clipStart = this.now();
    this._clipPeak = level;
    this._quietSince = null;
    this._loudFrames = 0;
    const startedAt = this._clipStart;
    let finalized = false;
    let resolveClip;
    const completion = new Promise(resolve => { resolveClip = resolve; });
    this._clipPromise = completion;
    const finish = async (failure) => {
      if (finalized) return;
      finalized = true;
      this.env.clearTimeout(this.clipTimer);
      this.clipTimer = null;
      this.recorder = null;
      const stoppedAt = this.now();
      let fatal;
      try {
        if (failure) throw failure;
        const blob = new (this.env.Blob || Blob)(chunks, { type: recorder.mimeType || this.mimeType || chunks[0]?.type || 'application/octet-stream' });
        if (blob.size && stoppedAt - startedAt >= 250) {
          if (this._bytes + blob.size > this.options.maxBytes) { this._gap('storage-limit'); fatal = 'size-limit'; }
          else {
            const clip = await this.storage.storeClip({ sessionId: this.session.id, blob, startedAt, durationMs: stoppedAt - startedAt, level: this._clipPeak, type: 'sound-event', classification: 'unclassified', source: 'microphone' });
            this._clipCount += 1;
            this._bytes += blob.size;
            const { blob: ignored, ...metadata } = clip;
            this._notify('onClip', metadata);
          }
          await this._persist();
        }
      } catch (error) { this._error(error); fatal = 'storage-or-recorder-error'; }
      finally {
        this._nextClipAt = this.now() + this.options.cooldownMs;
        this._quietSince = null;
        if (this._clipPromise === completion) this._clipPromise = null;
        resolveClip();
        if (!['stopping', 'stopped'].includes(this.state)) {
          if (this._clipCount >= this.options.maxClips) fatal = 'clip-limit';
          if (fatal) void this.stop({ reason: fatal });
          else this._status(this.state);
        }
      }
    };
    recorder.addEventListener('dataavailable', event => { if (event.data?.size) chunks.push(event.data); });
    recorder.addEventListener('stop', () => { void finish(); });
    recorder.addEventListener('error', event => { void finish(event.error || new Error('Audio recording was interrupted.')); });
    try {
      recorder.start();
      this.clipTimer = this.env.setTimeout(() => this._stopClip(), this.options.maxClipMs);
    } catch (error) { void finish(error); }
  }

  _stopClip() {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    try { this.recorder.stop(); }
    catch (error) { this._error(error); }
  }

  async _release() {
    this.env.clearInterval(this.sampleTimer);
    this.sampleTimer = null;
    this.env.clearTimeout(this.clipTimer);
    this.clipTimer = null;
    this._listeners.splice(0).forEach(remove => remove());
    try { this.source?.disconnect(); } catch {}
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    this.source = null;
    this.analyser = null;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
    this._notify('onLevel', { rms: 0, threshold: this.options?.threshold ?? 0.025, recording: false, at: this.now() });
  }

  stop({ reason = 'user' } = {}) {
    if (this._stopping) return this._stopping;
    if (['idle', 'stopped'].includes(this.state)) return Promise.resolve(this.session ? { ...this.session, clipCount: this._clipCount, bytes: this._bytes } : null);
    ++this._generation;
    this._status('stopping', { reason });
    this.env.clearInterval(this.sampleTimer);
    this.sampleTimer = null;
    this._stopping = (async () => {
      let timedOut = false;
      const pending = this._clipPromise;
      this._stopClip();
      if (pending) {
        let timer;
        await Promise.race([pending, new Promise(resolve => { timer = this.env.setTimeout(() => { timedOut = true; resolve(); }, 5000); })]);
        this.env.clearTimeout(timer);
      }
      if (timedOut) { this._gap('clip-finalization-timeout'); this._error(new Error('The last sound clip could not be finalized before recording stopped.')); }
      await this._release();
      for (const gap of this._activeGaps.values()) gap.end = this.now();
      this._activeGaps.clear();
      if (this.session) {
        this.session.end = this.now();
        this.session.status = reason === 'user' ? 'stopped' : 'interrupted';
        this.session.stopReason = reason;
        await this._persist().catch(error => this._error(error));
      }
      this._status('stopped', { reason });
      return this.session ? { ...this.session, clipCount: this._clipCount, bytes: this._bytes } : null;
    })().finally(() => { this._stopping = null; });
    return this._stopping;
  }
}
