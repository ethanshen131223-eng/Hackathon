import assert from 'node:assert/strict';
import test from 'node:test';
import {currentRows, gridValue, projectConcentration} from '../src/current-transport.js';

const baseline = {
  bounds: [-180, -85, 180, 85], maskWidth: 8, maskHeight: 1, mask: '\xff',
  values: Array.from({length:181}, () => Array.from({length:360}, (_, longitude) => longitude * 100)),
};
const hour = 3_600_000;

test('eastbound current samples upstream and calms preserve the baseline', () => {
  const rows = [10, 0, 0].map((speed, i) => ({timestamp:i * hour, speed, direction:90}));
  const projected = projectConcentration(baseline, [10, 0], rows);
  assert.equal(projected[0].density, 1000);
  assert.ok(projected[1].density < 1000);
  assert.equal(projected[1].density, projected[2].density);
  assert.equal(projected[2].distance, 10);
});

test('missing currents, off-grid water, and wrapped longitude are handled explicitly', () => {
  assert.equal(gridValue(baseline, 181, 0), gridValue(baseline, -179, 0));
  assert.equal(gridValue({...baseline, mask:'\0'}, 10, 0), null);
  const rows = currentRows({hourly_units:{ocean_current_velocity:'km/h'}, hourly:{
    time:['2026-11-21T00:00','2026-11-21T01:00'],
    ocean_current_velocity:[null, 1], ocean_current_direction:[null, 70],
  }}, 1);
  assert.equal(projectConcentration(baseline, [10, 0], rows)[1].density, null);
});
