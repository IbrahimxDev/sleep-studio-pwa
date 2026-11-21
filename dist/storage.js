// Audio remains in this origin's IndexedDB. No upload or network API is used.
const DB_NAME = 'sleep-studio-audio';
const DB_VERSION = 1;
let opening;

function id() {
  return globalThis.crypto?.randomUUID?.() || `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function openAudioDatabase() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Local audio storage is unavailable in this browser.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let abandoned = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('clips')) {
        const clips = db.createObjectStore('clips', { keyPath: 'id' });
        clips.createIndex('sessionId', 'sessionId', { unique: false });
        clips.createIndex('startedAt', 'startedAt', { unique: false });
      }
    };
    request.onerror = () => reject(request.error || new Error('Unable to open local audio storage.'));
    request.onblocked = () => { abandoned = true; reject(new Error('Audio storage is blocked by another open version of this app. Close other tabs and retry.')); };
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

async function transact(stores, mode, operation) {
  const db = await openAudioDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Local audio storage failed.'));
    tx.onabort = () => reject(tx.error || new Error('Local audio storage was interrupted.'));
    try { operation(tx, value => { result = value; }); }
    catch (error) { try { tx.abort(); } catch {} reject(error); }
  });
}

export async function putSession(session) {
  if (!session || typeof session.id !== 'string' || !session.id) throw new TypeError('A session ID is required.');
  const value = { ...session, gaps: Array.isArray(session.gaps) ? session.gaps : [] };
  await transact(['sessions'], 'readwrite', tx => tx.objectStore('sessions').put(value));
  return value;
}

export function getSession(sessionId) {
  return transact(['sessions'], 'readonly', (tx, done) => {
    const request = tx.objectStore('sessions').get(sessionId);
    request.onsuccess = () => done(request.result || null);
  });
}

export async function listSessions() {
  const rows = await transact(['sessions'], 'readonly', (tx, done) => {
    const request = tx.objectStore('sessions').getAll();
    request.onsuccess = () => done(request.result);
  });
  return rows.sort((a, b) => (b.start || 0) - (a.start || 0));
}

export async function storeClip(clip) {
  if (!clip || typeof clip.sessionId !== 'string' || !clip.sessionId) throw new TypeError('A session ID is required.');
  if (!(clip.blob instanceof Blob) || !clip.blob.size) throw new TypeError('A non-empty audio Blob is required.');
  const value = {
    ...clip,
    id: clip.id || id(),
    startedAt: Number.isFinite(clip.startedAt) ? clip.startedAt : Date.now(),
    durationMs: Math.max(0, Number(clip.durationMs) || 0),
    bytes: clip.blob.size,
    mimeType: clip.mimeType || clip.blob.type || 'application/octet-stream',
    type: clip.type || 'sound-event',
    classification: clip.classification || 'unclassified'
  };
  await transact(['clips'], 'readwrite', tx => tx.objectStore('clips').put(value));
  return value;
}

export function getClip(clipId) {
  return transact(['clips'], 'readonly', (tx, done) => {
    const request = tx.objectStore('clips').get(clipId);
    request.onsuccess = () => done(request.result || null);
  });
}

export async function listClips(sessionId, { includeBlob = false } = {}) {
  const rows = await transact(['clips'], 'readonly', (tx, done) => {
    const store = tx.objectStore('clips');
    const request = sessionId ? store.index('sessionId').getAll(sessionId) : store.getAll();
    request.onsuccess = () => done(request.result);
  });
  rows.sort((a, b) => b.startedAt - a.startedAt);
  if (includeBlob) return rows;
  return rows.map(({ blob, ...metadata }) => ({ ...metadata, bytes: metadata.bytes ?? blob?.size ?? 0 }));
}

export function deleteClip(clipId) {
  return transact(['clips'], 'readwrite', tx => tx.objectStore('clips').delete(clipId));
}

export function deleteSession(sessionId) {
  return transact(['sessions', 'clips'], 'readwrite', tx => {
    tx.objectStore('sessions').delete(sessionId);
    const clips = tx.objectStore('clips');
    const cursor = clips.index('sessionId').openKeyCursor(sessionId);
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (row) { clips.delete(row.primaryKey); row.continue(); }
    };
  });
}

// Returns structured local records and Blobs. The caller chooses an export format.
export async function exportSession(sessionId) {
  const [session, clips] = await Promise.all([getSession(sessionId), listClips(sessionId, { includeBlob: true })]);
  return { session, clips };
}

// Call only after an explicit user request to erase all stored audio.
export function clearAudioData() {
  return transact(['sessions', 'clips'], 'readwrite', tx => {
    tx.objectStore('sessions').clear();
    tx.objectStore('clips').clear();
  });
}
