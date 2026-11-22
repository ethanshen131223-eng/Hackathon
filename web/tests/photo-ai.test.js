import test from 'node:test';
import assert from 'node:assert/strict';
import {photoSuggestions} from '../src/photo-ai.js';

test('photo suggestions clamp boxes and reject invalid or duplicate detections', () => {
  const prediction = {label:'plastic bottle', score:0.7, box:{xmin:-0.1, ymin:0.2, xmax:0.4, ymax:0.6}};
  const results = photoSuggestions([
    {...prediction, score:0.3},
    prediction,
    {...prediction, score:0.9, box:{...prediction.box, xmax:NaN}},
  ]);
  assert.deepEqual(results, [{label:'plastic bottle', score:0.7, box:{xmin:0, ymin:0.2, xmax:0.4, ymax:0.6}}]);
});
