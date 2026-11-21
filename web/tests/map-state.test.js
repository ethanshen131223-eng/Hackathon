import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseArea, filterDetections} from '../src/map-state.js';

test('random startup can select either area; random-next avoids current area', () => {
  const areas = [{id: 'a'}, {id: 'b'}];
  assert.equal(chooseArea(areas, null, () => 0).id, 'a');
  assert.equal(chooseArea(areas, null, () => 0.99).id, 'b');
  assert.equal(chooseArea(areas, 'a', () => 0).id, 'b');
  assert.equal(chooseArea([areas[0]], 'a', () => 0).id, 'a');
  assert.equal(chooseArea([], null), null);
});

test('confidence filter includes threshold and isolates current region', () => {
  const points = [{areaId: 'a', confidence: 0.8}, {areaId: 'a', confidence: 0.4},
                  {areaId: 'b', confidence: 0.9}];
  assert.deepEqual(filterDetections(points, 'a', 0.8), [points[0]]);
  assert.deepEqual(filterDetections(points, 'missing', 0), []);
});
