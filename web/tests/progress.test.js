import test from 'node:test';
import assert from 'node:assert/strict';

// A missing implementation produces an assertion failure during the initial red run.
const implementation = import('../src/progress.js').catch(() => null);
async function progress() {
  const api = await implementation;
  assert.ok(api, 'The progression module must exist');
  return api;
}

function memoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem() { return value; },
    setItem(_key, nextValue) { value = nextValue; },
    read() { return value; },
  };
}

test('fresh profiles have independent collections and no earned currency', async () => {
  const {newProfile} = await progress();
  const first = newProfile();
  const second = newProfile();
  assert.deepEqual(first, {
    version: 1, balance: 0, streak: 0, lastDailyDate: null,
    completedCases: {}, inventory: [], ownedCosmetics: [], equippedCosmetic: null,
    gameClaims: {},
  });
  first.inventory.push({label: 'Saved only in the first profile'});
  assert.deepEqual(second.inventory, []);
});

test('date keys follow the local calendar and pad month and day', async () => {
  const {dateKey} = await progress();
  assert.equal(dateKey(new Date(2026, 0, 2, 0, 30)), '2026-01-02');
  assert.equal(dateKey(new Date(2026, 10, 21, 23, 59)), '2026-11-21');
});

test('training completion pays once and preserves finding provenance', async () => {
  const {newProfile, completeCase} = await progress();
  const original = newProfile();
  const findings = [{id: 'bottle', category: 'plastic', notes: {reviewed: true}}];
  const first = completeCase(original, {id: 'shore', title: 'Shore survey', findings});
  assert.equal(first.reward, 20);
  assert.equal(first.alreadyCompleted, false);
  assert.equal(first.profile.balance, 20);
  assert.equal(first.profile.inventory.length, 1);
  assert.deepEqual(first.profile.inventory[0], {
    id: 'bottle', category: 'plastic', notes: {reviewed: true},
    caseId: 'shore', caseTitle: 'Shore survey', source: 'training',
  });
  assert.equal(first.profile.completedCases.shore.findingCount, 1);
  assert.equal(original.balance, 0);
  assert.deepEqual(original.inventory, []);
  findings[0].notes.reviewed = false;
  assert.equal(first.profile.inventory[0].notes.reviewed, true);

  const repeated = completeCase(first.profile, {
    id: 'shore', title: 'Changed', findings: [{id: 'bag'}], reward: 80,
  });
  assert.equal(repeated.reward, 0);
  assert.equal(repeated.alreadyCompleted, true);
  assert.equal(repeated.profile.balance, 20);
  assert.equal(repeated.profile.inventory[0].id, 'bottle');
  assert.equal(repeated.profile.completedCases.shore.title, 'Shore survey');
});

test('case rewards are bounded and manual observations never issue currency', async () => {
  const {newProfile, completeCase} = await progress();
  const capped = completeCase(newProfile(), {id: 'training', findings: [], reward: 999});
  assert.equal(capped.reward, 80);
  const negative = completeCase(capped.profile, {id: 'negative', findings: [], reward: -20});
  assert.equal(negative.reward, 0);
  const manual = completeCase(negative.profile, {
    id: 'photo', title: 'My photo', findings: [{label: 'Suspected fragment'}],
    source: 'manual', reward: 80,
  });
  assert.equal(manual.reward, 0);
  assert.equal(manual.profile.balance, 80);
  assert.equal(manual.profile.inventory[0].source, 'manual');
});

test('saving a manual case again replaces its findings without affecting another case', async () => {
  const {newProfile, completeCase} = await progress();
  let profile = completeCase(newProfile(), {
    id: 'training', title: 'Training', findings: [{label: 'Authored clue'}],
  }).profile;
  profile = completeCase(profile, {
    id: 'photo', title: 'Draft', source: 'manual', findings: [{label: 'Old mark'}],
  }).profile;
  const result = completeCase(profile, {
    id: 'photo', title: 'Reviewed photo', source: 'manual', reward: 80,
    findings: [{label: 'Reviewed mark'}, {label: 'Second mark'}],
  });
  assert.equal(result.alreadyCompleted, true);
  assert.equal(result.reward, 0);
  assert.equal(result.profile.balance, 20);
  assert.deepEqual(result.profile.inventory.map(item => item.label), [
    'Authored clue', 'Reviewed mark', 'Second mark',
  ]);
  assert.equal(result.profile.completedCases.photo.title, 'Reviewed photo');
  assert.equal(result.profile.completedCases.photo.reward, 0);
  assert.equal(result.profile.completedCases.photo.findingCount, 2);
  assert.equal(profile.inventory.find(item => item.caseId === 'photo').label, 'Old mark');
});

test('a completed training case cannot be rewritten by reusing its ID for manual work', async () => {
  const {newProfile, completeCase} = await progress();
  const first = completeCase(newProfile(), {
    id: 'shore', title: 'Training', findings: [{label: 'Original'}],
  }).profile;
  const repeated = completeCase(first, {
    id: 'shore', title: 'Manual overwrite', source: 'manual', findings: [],
  });
  assert.equal(repeated.profile.inventory.length, 1);
  assert.equal(repeated.profile.completedCases.shore.source, 'training');
});

test('a daily puzzle pays ten initially and fifteen the next day without mutating earlier profiles', async () => {
  const {newProfile, claimDaily} = await progress();
  const original = newProfile();
  const dayOne = claimDaily(original, '2026-11-21');
  const dayTwo = claimDaily(dayOne.profile, '2026-11-22');
  assert.equal(dayOne.reward, 10);
  assert.equal(dayOne.profile.streak, 1);
  assert.equal(dayTwo.reward, 15);
  assert.equal(dayTwo.profile.streak, 2);
  assert.equal(dayTwo.profile.balance, 25);
  assert.equal(dayTwo.profile.lastDailyDate, '2026-11-22');
  assert.equal(original.balance, 0);
  assert.equal(dayOne.profile.lastDailyDate, '2026-11-21');
});

test('same-day and backward daily claims cannot increase currency or lower the saved date', async () => {
  const {newProfile, claimDaily} = await progress();
  const profile = claimDaily(newProfile(), '2026-11-21').profile;
  for (const date of ['2026-11-21', '2026-11-20', '2025-11-21']) {
    const result = claimDaily(profile, date);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.reward, 0);
    assert.equal(result.profile.balance, 10);
    assert.equal(result.profile.lastDailyDate, '2026-11-21');
    assert.equal(result.profile.streak, 1);
  }
});

test('a gap resets the streak and reward', async () => {
  const {newProfile, claimDaily} = await progress();
  const previous = {...newProfile(), balance: 25, streak: 2, lastDailyDate: '2026-11-21'};
  const result = claimDaily(previous, '2026-11-23');
  assert.equal(result.reward, 10);
  assert.equal(result.profile.streak, 1);
  assert.equal(result.profile.balance, 35);
});

for (const [previous, today] of [
  ['2026-12-31', '2027-01-01'],
  ['2028-02-28', '2028-02-29'],
  ['2028-02-29', '2028-03-01'],
  ['2026-03-08', '2026-03-09'],
  ['2026-11-01', '2026-11-02'],
]) {
  test(`calendar streak continues across ${previous} to ${today}`, async () => {
    const {newProfile, claimDaily} = await progress();
    const profile = {...newProfile(), streak: 4, lastDailyDate: previous};
    const result = claimDaily(profile, today);
    assert.equal(result.profile.streak, 5);
    assert.equal(result.reward, 30);
  });
}

test('daily rewards stop growing at one hundred', async () => {
  const {newProfile, claimDaily} = await progress();
  const result = claimDaily({...newProfile(), streak: 30, lastDailyDate: '2026-11-20'}, '2026-11-21');
  assert.equal(result.reward, 100);
  assert.equal(result.profile.streak, 31);
});

test('invalid calendar dates cannot corrupt daily progression', async () => {
  const {newProfile, claimDaily} = await progress();
  for (const date of ['2026-02-29', '2026-13-01', 'not-a-date']) {
    assert.throws(() => claimDaily(newProfile(), date), RangeError);
  }
});

test('games pay at most five once per game per day and cannot be farmed by moving the date backward', async () => {
  const {newProfile, awardGame} = await progress();
  const first = awardGame(newProfile(), 'cleanup', '2026-11-21', 500);
  assert.equal(first.reward, 5);
  assert.equal(first.profile.balance, 5);
  assert.equal(first.alreadyClaimed, false);
  const repeat = awardGame(first.profile, 'cleanup', '2026-11-21');
  assert.equal(repeat.reward, 0);
  assert.equal(repeat.alreadyClaimed, true);
  const backward = awardGame(first.profile, 'cleanup', '2026-11-20');
  assert.equal(backward.reward, 0);
  const anotherGame = awardGame(repeat.profile, 'sizes', '2026-11-21');
  assert.equal(anotherGame.profile.balance, 10);
  const nextDay = awardGame(anotherGame.profile, 'cleanup', '2026-11-22');
  assert.equal(nextDay.profile.balance, 15);
  assert.equal(first.profile.gameClaims.cleanup, '2026-11-21');
});

test('zero or invalid game rewards never subtract from the wallet', async () => {
  const {newProfile, awardGame} = await progress();
  for (const reward of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = awardGame({...newProfile(), balance: 20}, 'sizes', '2026-11-21', reward);
    assert.equal(result.reward, 0);
    assert.equal(result.profile.balance, 20);
  }
});

test('shop purchases spend earned currency once and equip only an owned item', async () => {
  const {newProfile, SHOP, buyCosmetic, equipCosmetic} = await progress();
  const cheapest = SHOP.find(item => item.price === 30);
  assert.ok(cheapest, 'An affordable thirty-sand-dollar cosmetic is available');
  const original = {...newProfile(), balance: 30};
  const bought = buyCosmetic(original, cheapest.id);
  assert.equal(bought.purchased, true);
  assert.equal(bought.error, null);
  assert.equal(bought.profile.balance, 0);
  assert.deepEqual(bought.profile.ownedCosmetics, [cheapest.id]);
  assert.deepEqual(original.ownedCosmetics, []);
  const repeated = buyCosmetic(bought.profile, cheapest.id);
  assert.equal(repeated.purchased, false);
  assert.ok(repeated.error);
  assert.equal(repeated.profile.balance, 0);
  const equipped = equipCosmetic(bought.profile, cheapest.id);
  assert.equal(equipped.error, null);
  assert.equal(equipped.profile.equippedCosmetic, cheapest.id);
  assert.equal(bought.profile.equippedCosmetic, null);
});

test('low funds, unknown items, and unowned cosmetics cannot change wallet or equipped style', async () => {
  const {newProfile, SHOP, buyCosmetic, equipCosmetic} = await progress();
  const profile = {...newProfile(), balance: 29};
  const unaffordable = buyCosmetic(profile, SHOP[0].id);
  assert.equal(unaffordable.purchased, false);
  assert.ok(unaffordable.error);
  assert.equal(unaffordable.profile.balance, 29);
  assert.deepEqual(unaffordable.profile.ownedCosmetics, []);
  assert.ok(buyCosmetic(profile, 'missing').error);
  assert.ok(equipCosmetic(profile, SHOP[0].id).error);
  assert.equal(equipCosmetic(profile, SHOP[0].id).profile.equippedCosmetic, null);
});

test('profile save and load retain earned progress without sharing mutable references', async () => {
  const {newProfile, completeCase, claimDaily, saveProfile, loadProfile} = await progress();
  const storage = memoryStorage();
  const first = completeCase(newProfile(), {
    id: 'shore', title: 'Shore', findings: [{label: 'Bottle'}],
  }).profile;
  const earned = claimDaily(first, '2026-11-21').profile;
  const saved = saveProfile(earned, storage);
  assert.equal(saved.persisted, true);
  const loaded = loadProfile(storage);
  assert.deepEqual(loaded, earned);
  loaded.inventory[0].label = 'Local edit';
  assert.equal(loadProfile(storage).inventory[0].label, 'Bottle');
  assert.equal(earned.inventory[0].label, 'Bottle');
});

test('corrupt and unsupported persisted profiles recover to usable defaults', async () => {
  const {newProfile, loadProfile} = await progress();
  for (const value of ['{broken', 'null', '[]', '{"version":9}', '{"version":1,"balance":-80}']) {
    const loaded = loadProfile(memoryStorage(value));
    assert.deepEqual(loaded, newProfile());
  }
});

test('malformed optional profile fields cannot crash consumers or equip an unowned style', async () => {
  const {newProfile, loadProfile} = await progress();
  const storage = memoryStorage(JSON.stringify({
    ...newProfile(), balance: 12, streak: -2, lastDailyDate: '2026-02-31',
    inventory: {}, completedCases: {broken: null, number: 23}, ownedCosmetics: [42, 'missing'],
    equippedCosmetic: 'missing', gameClaims: null,
  }));
  const loaded = loadProfile(storage);
  assert.equal(loaded.balance, 12);
  assert.equal(loaded.streak, 0);
  assert.equal(loaded.lastDailyDate, null);
  assert.deepEqual(loaded.inventory, []);
  assert.deepEqual(loaded.completedCases, {});
  assert.deepEqual(loaded.ownedCosmetics, []);
  assert.equal(loaded.equippedCosmetic, null);
  assert.deepEqual(loaded.gameClaims, {});
});

test('quota failures are visible while keeping earned progress in memory', async () => {
  const {newProfile, saveProfile, loadProfile} = await progress();
  const profile = {...newProfile(), balance: 45};
  const blocked = {
    getItem() { throw new Error('Storage denied'); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  const saved = saveProfile(profile, blocked);
  assert.equal(saved.persisted, false);
  assert.equal(saved.profile.balance, 45);
  assert.equal(loadProfile(blocked).balance, 45);
  saved.profile.balance = 0;
  assert.equal(loadProfile(blocked).balance, 45);
});

test('missing storage is an explicit in-memory fallback', async () => {
  const {newProfile, saveProfile, loadProfile} = await progress();
  const saved = saveProfile({...newProfile(), balance: 17}, null);
  assert.equal(saved.persisted, false);
  assert.equal(loadProfile(null).balance, 17);
});

test('a failed write cannot reload stale persisted progress over the current session', async () => {
  const {newProfile, saveProfile, loadProfile} = await progress();
  const storage = {
    getItem() { return JSON.stringify({...newProfile(), balance: 3}); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.equal(saveProfile({...newProfile(), balance: 43}, storage).persisted, false);
  assert.equal(loadProfile(storage).balance, 43);
});

test('default storage security exceptions do not escape profile loading or saving', async t => {
  const {newProfile, saveProfile, loadProfile} = await progress();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError'); },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
  assert.equal(saveProfile({...newProfile(), balance: 23}).persisted, false);
  assert.equal(loadProfile().balance, 23);
});
