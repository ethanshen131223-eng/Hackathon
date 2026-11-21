import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBounds, sourceUrls, requestViewportData} from '../src/viewport.js';

test('unwrapped date-line views become wrapped bounds and full-world views stay full-world', () => {
  assert.deepEqual(normalizeBounds([130, -33, 227, 33]), [130, -33, -133, 33]);
  assert.deepEqual(normalizeBounds([-416, -88, 356, 89]), [-180, -88, 180, 89]);
  assert.deepEqual(normalizeBounds([170, -10, -170, 10]), [170, -10, -170, 10]);
});

test('aggregated observation URLs stay separate and unsafe schemes are excluded', () => {
  assert.deepEqual(sourceUrls(['https://a.example/?id=1', 'https://b.example/?id=2']),
    ['https://a.example/?id=1', 'https://b.example/?id=2']);
  assert.deepEqual(sourceUrls('https://a.example/'), ['https://a.example/']);
  assert.deepEqual(sourceUrls(['javascript:bad', null]), []);
});

test('protected request begins while a pollution request is still pending', async () => {
  let completeTiles;
  const pendingTiles = new Promise(resolve => { completeTiles = resolve; });
  let protectedBounds;
  const complete = requestViewportData([1, 2, 3, 4], 8, {
    requestTiles: () => pendingTiles,
    requestProtected: bounds => { protectedBounds = bounds; return Promise.resolve(); },
    protectedEnabled: true,
  });
  assert.deepEqual(protectedBounds, [1, 2, 3, 4]);
  completeTiles(); await complete;
});
