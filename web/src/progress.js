// Earned sand dollars are a local learning-game score, with no monetary value.
const STORAGE_KEY = 'marineguarder.progress.v1';
const DAY_MS = 86_400_000;

export const SHOP = Object.freeze([
  Object.freeze({
    id: 'tidal-blue', name: 'Tidal blue', price: 30, accent: '#246cda',
    description: 'Bring a bright open-ocean blue to your field station.',
  }),
  Object.freeze({
    id: 'lagoon-teal', name: 'Lagoon teal', price: 60, accent: '#17b5b0',
    description: 'Give your field station a calm turquoise current.',
  }),
  Object.freeze({
    id: 'coral-current', name: 'Coral current', price: 90, accent: '#ff976e',
    description: 'Add a warm coral accent to your field station.',
  }),
]);

export function newProfile() {
  return {
    version: 1, balance: 0, streak: 0, lastDailyDate: null,
    completedCases: {}, inventory: [], ownedCosmetics: [], equippedCosmetic: null,
    gameClaims: {},
  };
}

let memoryProfile = newProfile();
// A failed write must not allow a subsequent read of older browser data to
// overwrite progress earned during the current session.
const failedStores = new WeakMap();

export function dateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError('A valid local date is required.');
  }
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / DAY_MS;
}

function requireDay(value) {
  const day = calendarDay(value);
  if (day === null) throw new RangeError('Use a valid YYYY-MM-DD calendar date.');
  return day;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function boundedReward(value, maximum) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

function storedProfile(value) {
  if (!record(value) || value.version !== 1 || !count(value.balance)) return newProfile();
  const owned = Array.isArray(value.ownedCosmetics)
    ? [...new Set(value.ownedCosmetics.filter(id => SHOP.some(item => item.id === id)))] : [];
  return {
    version: 1,
    balance: value.balance,
    streak: count(value.streak) ? value.streak : 0,
    lastDailyDate: calendarDay(value.lastDailyDate) !== null ? value.lastDailyDate : null,
    completedCases: record(value.completedCases)
      ? structuredClone(Object.fromEntries(Object.entries(value.completedCases).filter(([, entry]) => record(entry)))) : {},
    inventory: Array.isArray(value.inventory) ? structuredClone(value.inventory.filter(record)) : [],
    ownedCosmetics: owned,
    equippedCosmetic: owned.includes(value.equippedCosmetic) ? value.equippedCosmetic : null,
    gameClaims: record(value.gameClaims)
      ? Object.fromEntries(Object.entries(value.gameClaims).filter(([, day]) => calendarDay(day) !== null)) : {},
  };
}

function defaultStorage() {
  // Reading the localStorage property itself can throw in restricted browsers.
  try { return globalThis.localStorage; } catch { return null; }
}

function usableStore(storage, method) {
  return storage !== null && typeof storage === 'object' && typeof storage[method] === 'function';
}

export function loadProfile(storage) {
  const store = storage === undefined ? defaultStorage() : storage;
  let saved;
  try {
    if (!usableStore(store, 'getItem')) return structuredClone(memoryProfile);
    if (failedStores.has(store)) return structuredClone(failedStores.get(store));
    saved = store.getItem(STORAGE_KEY);
  } catch {
    return structuredClone(memoryProfile);
  }
  try {
    memoryProfile = saved === null ? newProfile() : storedProfile(JSON.parse(saved));
  } catch {
    memoryProfile = newProfile();
  }
  return structuredClone(memoryProfile);
}

export function saveProfile(profile, storage) {
  const next = structuredClone(profile);
  memoryProfile = structuredClone(next);
  const store = storage === undefined ? defaultStorage() : storage;
  try {
    if (!usableStore(store, 'setItem')) return {persisted: false, profile: next};
    store.setItem(STORAGE_KEY, JSON.stringify(next));
    failedStores.delete(store);
    return {persisted: true, profile: next};
  } catch {
    if (store !== null && typeof store === 'object') failedStores.set(store, structuredClone(next));
    return {persisted: false, profile: next};
  }
}

function requireId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('An item ID is required.');
}

export function completeCase(profile, {id, title, findings, source = 'training', reward = 20}) {
  requireId(id);
  const next = structuredClone(profile);
  const previous = Object.hasOwn(next.completedCases, id) ? next.completedCases[id] : null;
  const manual = source === 'manual';
  // Authored answers remain a stable record. Manual work can be revised under
  // its existing ID without duplicating findings or issuing a training reward.
  if (previous && !(manual && previous.source === 'manual')) {
    return {profile: next, reward: 0, alreadyCompleted: true};
  }
  const entries = Array.isArray(findings) ? findings.filter(record).map(finding => ({
    ...structuredClone(finding), caseId: id, caseTitle: title || id, source,
  })) : [];
  const earned = manual || previous ? 0 : boundedReward(reward, 80);
  next.balance += earned;
  next.inventory = [...next.inventory.filter(item => item.caseId !== id), ...entries];
  next.completedCases = {
    ...next.completedCases,
    [id]: {id, title: title || id, source, reward: previous?.reward ?? earned, findingCount: entries.length},
  };
  return {profile: next, reward: earned, alreadyCompleted: Boolean(previous)};
}

export function claimDaily(profile, today = dateKey()) {
  const day = requireDay(today);
  const previous = calendarDay(profile.lastDailyDate);
  const next = structuredClone(profile);
  if (previous !== null && day <= previous) {
    return {profile: next, reward: 0, alreadyClaimed: true};
  }
  next.streak = previous !== null && day - previous === 1 ? profile.streak + 1 : 1;
  const reward = Math.min(100, 10 + (next.streak - 1) * 5);
  next.balance += reward;
  next.lastDailyDate = today;
  return {profile: next, reward, alreadyClaimed: false};
}

export function awardGame(profile, gameId, today = dateKey(), reward = 5) {
  requireId(gameId);
  const day = requireDay(today);
  const next = structuredClone(profile);
  const previous = Object.hasOwn(profile.gameClaims, gameId) ? calendarDay(profile.gameClaims[gameId]) : null;
  if (previous !== null && day <= previous) {
    return {profile: next, reward: 0, alreadyClaimed: true};
  }
  const earned = boundedReward(reward, 5);
  next.balance += earned;
  next.gameClaims = {...next.gameClaims, [gameId]: today};
  return {profile: next, reward: earned, alreadyClaimed: false};
}

export function buyCosmetic(profile, id) {
  const next = structuredClone(profile);
  const item = SHOP.find(cosmetic => cosmetic.id === id);
  if (!item) return {profile: next, purchased: false, error: 'Choose an available cosmetic.'};
  if (next.ownedCosmetics.includes(id)) return {profile: next, purchased: false, error: 'You already own this cosmetic.'};
  if (next.balance < item.price) return {profile: next, purchased: false, error: 'Earn more sand dollars to buy this cosmetic.'};
  next.balance -= item.price;
  next.ownedCosmetics.push(id);
  return {profile: next, purchased: true, error: null};
}

export function equipCosmetic(profile, id) {
  const next = structuredClone(profile);
  if (!SHOP.some(item => item.id === id) || !next.ownedCosmetics.includes(id)) {
    return {profile: next, error: 'Buy this cosmetic before equipping it.'};
  }
  next.equippedCosmetic = id;
  return {profile: next, error: null};
}
