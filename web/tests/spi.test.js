import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySPI} from '../src/spi.js';

test('SPI boundary values use the same fixed thresholds at every zoom', () => {
  for (const [density, expected] of [[0,'Very Low'],[49.99,'Very Low'],[50,'Low'],
    [99.99,'Low'],[100,'Medium'],[199.99,'Medium'],[200,'High'],[599.99,'High'],[600,'Severe']]) {
    assert.equal(classifySPI(density).name, expected);
  }
});
test('missing, nonfinite and negative densities remain unclassified', () => {
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(classifySPI(value), null);
});
