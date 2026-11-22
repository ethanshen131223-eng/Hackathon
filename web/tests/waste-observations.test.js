import assert from 'node:assert/strict';
import test from 'node:test';
import {groupObservations, createWasteObservationLayer} from '../src/waste-observations.js';

test('world zoom groups real locations while local zoom separates nearby records', () => {
  const samples = [[-155, 31, 1, 'Ocean water', 0.02, 'pieces/m3'], [-154, 31, 2, 'Nurdles', 200, 'pieces/10 mins']];
  const world = groupObservations(samples, 1);
  assert.equal(world.length, 1);
  assert.deepEqual(world[0].position, samples[0].slice(0, 2));
  assert.deepEqual(world[0].samples, samples);
  assert.equal(groupObservations(samples, 12).length, 2);
  const layer = createWasteObservationLayer({groups: world, kind: 'noaa'});
  assert.ok(layer.props.pickable);
  assert.ok(layer.props.getRadius(world[0]) > 3.5);
});
