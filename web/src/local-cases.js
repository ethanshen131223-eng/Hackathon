// Images and annotations stay in this browser. No network storage is used.
import {validOutline} from './outlines.js';
const DATABASE = 'marineguarder-local-casework';
const clone = value => JSON.parse(JSON.stringify(value));

function validateRecord(input, kind) {
  const entry = clone(input);
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) throw new Error('A record id is required.');
  if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error('Give this record a title.');
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(entry.imageDataUrl || '')) {
    throw new Error('A local image in JPEG, PNG, or WebP format is required.');
  }
  if (!entry.createdAt || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('A valid creation date is required.');
  const key = kind === 'cases' ? 'findings' : 'targets';
  if (!Array.isArray(entry[key]) || (kind === 'puzzles' && !entry[key].length)) {
    throw new Error(kind === 'puzzles' ? 'Add at least one target before saving.' : 'Findings must be a list.');
  }
  entry.source = kind === 'cases' ? 'manual' : 'user-authored';
  if (kind === 'cases' && !['surface', 'magnified'].includes(entry.mode)) throw new Error('Choose a surface or magnified view.');
  const ids = new Set();
  for (const item of entry[key]) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Each marker needs a unique id.');
    ids.add(item.id);
    if (item.outline !== undefined && !validOutline(item.outline)) throw new Error('An outline must contain 3 to 600 valid points inside the image.');
    if (![item.x, item.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Marker position must be inside the image.');
    }
    if (!Number.isFinite(item.radius) || item.radius <= 0 || item.radius > 0.5) throw new Error('Marker radius must be greater than zero and at most half the image width.');
    if (typeof item.label !== 'string' || !item.label.trim()) throw new Error('Give each marker a label.');
    if (typeof item.category !== 'string' || !item.category) throw new Error('Choose a marker category.');
    if (kind === 'cases') {
      if (item.sizeMm !== null && (!Number.isFinite(item.sizeMm) || item.sizeMm <= 0)) throw new Error('Measured size must be positive, or left unknown.');
      if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('Quantity must be a whole number of at least one.');
      if (typeof item.notes !== 'string') throw new Error('Finding notes must be text.');
    } else if (typeof item.clue !== 'string') throw new Error('A target clue must be text.');
  }
  return entry;
}

function indexedDbPersistence() {
  let factory;
  try { factory = globalThis.indexedDB; } catch { return null; }
  if (!factory) return null;
  let opening;
  const database = () => {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      const timeout = setTimeout(() => reject(new Error('Browser storage did not respond.')), 5000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      request.onupgradeneeded = () => {
        for (const name of ['cases', 'puzzles']) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, {keyPath: 'id'});
        }
      };
      request.onerror = () => fail(request.error || new Error('Browser storage could not be opened.'));
      request.onblocked = () => fail(new Error('Browser storage is blocked by another open tab.'));
      request.onsuccess = () => {
        clearTimeout(timeout);
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
    return opening;
  };
  return {
    async list(kind) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(kind, 'readonly');
        const request = transaction.objectStore(kind).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Saved records could not be read.'));
        transaction.onabort = () => reject(transaction.error || new Error('Reading saved records was interrupted.'));
      });
    },
    async put(kind, entry) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(kind, 'readwrite');
        transaction.objectStore(kind).put(entry);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('The browser could not save this record.'));
        transaction.onabort = () => reject(transaction.error || new Error('Saving was interrupted.'));
      });
    },
  };
}

/** A storage adapter may implement async list(kind) and put(kind, record). */
export function createLocalRepository({persistence = indexedDbPersistence()} = {}) {
  const memory = {cases: new Map(), puzzles: new Map()};
  const temporaryIds = {cases: new Set(), puzzles: new Set()};
  let status = {persistent: Boolean(persistence), reason: persistence ? '' : 'Browser storage is unavailable. Records last only for this session; export a copy.'};
  const temporary = error => {
    status = {persistent: false, reason: `${error?.message || 'Browser storage is unavailable.'} Records are kept only for this session; export a copy.`};
  };
  async function save(kind, input) {
    const entry = validateRecord(input, kind);
    memory[kind].set(entry.id, entry);
    temporaryIds[kind].add(entry.id);
    let persisted = false;
    if (persistence) {
      try { await persistence.put(kind, clone(entry)); persisted = true; temporaryIds[kind].delete(entry.id); }
      catch (error) { temporary(error); }
    }
    return {entry: clone(entry), persisted, status: {...status}};
  }
  async function list(kind) {
    if (persistence) {
      try {
        const stored = await persistence.list(kind);
        if (!Array.isArray(stored)) throw new Error('Saved records could not be read.');
        for (const input of stored) {
          try {
            const entry = validateRecord(input, kind);
            if (!temporaryIds[kind].has(entry.id)) memory[kind].set(entry.id, entry);
          }
          catch { /* A malformed record must not hide the other saved work. */ }
        }
      } catch (error) { temporary(error); }
    }
    return [...memory[kind].values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }
  return {
    saveCase: input => save('cases', input),
    savePuzzle: input => save('puzzles', input),
    listCases: () => list('cases'),
    listPuzzles: () => list('puzzles'),
    loadCase: async id => (await list('cases')).find(entry => entry.id === id) || null,
    loadPuzzle: async id => (await list('puzzles')).find(entry => entry.id === id) || null,
    getStatus: () => ({...status}),
  };
}

const repository = createLocalRepository();
export const saveLocalCase = entry => repository.saveCase(entry);
export const saveLocalPuzzle = entry => repository.savePuzzle(entry);
export const listLocalCases = () => repository.listCases();
export const listLocalPuzzles = () => repository.listPuzzles();
export const loadLocalCase = id => repository.loadCase(id);
export const loadLocalPuzzle = id => repository.loadPuzzle(id);
export const getLocalStorageStatus = () => repository.getStatus();
