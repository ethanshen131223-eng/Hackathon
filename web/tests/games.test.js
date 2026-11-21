import test from 'node:test';
import assert from 'node:assert/strict';

const implementation = import('../src/games.js').catch(() => null);
async function games() {
  const api = await implementation;
  assert.ok(api, 'The learning games module must exist');
  return api;
}

test('cleanup requires all twelve distinct virtual items and ignores repeated or unknown clicks', async () => {
  const {CLEANUP_ITEMS, collectCleanupItem} = await games();
  assert.equal(CLEANUP_ITEMS.length, 12);
  const original = [];
  const first = collectCleanupItem(original, 'cleanup-1');
  assert.deepEqual(original, []);
  assert.equal(first.length, 1);
  assert.equal(collectCleanupItem(first, 'cleanup-1').length, 1);
  assert.equal(collectCleanupItem(first, 'not-trash').length, 1);
  let collected = first;
  for (let index = 2; index <= 11; index += 1) {
    collected = collectCleanupItem(collected, `cleanup-${index}`);
  }
  assert.equal(collected.length, 11);
  collected = collectCleanupItem(collected, 'cleanup-12');
  assert.equal(collected.length, 12);
  assert.equal(collectCleanupItem(collected, 'cleanup-12').length, 12);
});

test('cleanup positions keep each button inside the scene at narrow and wide widths', async () => {
  const {CLEANUP_ITEMS} = await games();
  for (const width of [200, 320, 800]) {
    for (const item of CLEANUP_ITEMS) {
      const left = item.x * (width - 55);
      const top = item.y * (360 - 55);
      assert.ok(left >= 0 && left + 55 <= width);
      assert.ok(top >= 0 && top + 55 <= 360);
    }
  }
});
