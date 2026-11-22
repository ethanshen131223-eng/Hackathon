import assert from 'node:assert/strict';
import test from 'node:test';
import {selectCleanupMethod} from '../src/cleanup-methods.js';

test('map evidence selects a matching method without inferring shoreline conditions from SPI', () => {
  const examples = [
    [{context:'Protected Planet: Marine reserve'}, 'protected'],
    [{context:'Modeled river outfall · 200 metric tonnes per year'}, 'river'],
    [{context:'NOAA field sample · Beach-Nurdle Patrol'}, 'shore'],
    [{setting:'offshore'}, 'offshore'],
    [{context:'Severe SPI · 900 floating pieces/km²'}, 'unknown'],
  ];
  for (const [site, expected] of examples) {
    const method = selectCleanupMethod(site);
    assert.equal(method.setting, expected);
    const words = method.steps.join(' ').trim().split(/\s+/).length;
    assert.ok(words >= 100 && words <= 200, `${expected} has ${words} words`);
    assert.equal(method.steps.length, 4);
    assert.ok(method.sources.every(([, url]) => url.startsWith('https://')));
    assert.ok(method.drones);
  }
  assert.equal(selectCleanupMethod({setting:'shore', water:'unsafe'}).hold, true);
});
