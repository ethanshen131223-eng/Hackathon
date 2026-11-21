import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, classifySize, hitTest, scoreFindings, dailyCase } from '../src/case-content.js';

test('size classification keeps each touching boundary in one category', () => {
  for (const [size, expected] of [[0.1, 'micro'], [4.999, 'micro'], [5, 'small'], [9.999, 'small'], [10, 'medium'], [49.999, 'medium'], [50, 'large'], [100, 'large'], [100.001, 'oversized']]) {
    assert.equal(classifySize(size)?.id, expected, `${size} mm`);
  }
});

test('unknown or invalid measurements never imply a size category', () => {
  for (const value of [null, undefined, '', '5', 0, -1, NaN, Infinity, -Infinity]) assert.equal(classifySize(value), null);
});

test('scoring counts a finding once and ignores unrecognized IDs', () => {
  const scenario = { targets: [{ id: 'bottle' }, { id: 'bag' }], distractors: [{ id: 'leaf' }] };
  assert.deepEqual(scoreFindings(scenario, ['bottle', 'bottle', 'missing']), {
    correct: 1, total: 2, falsePositives: 0, foundIds: ['bottle'], missedIds: ['bag'], complete: false, accuracy: 1,
  });
});

test('a natural item lowers precision and prevents a perfect case', () => {
  const scenario = { targets: [{ id: 'bottle' }, { id: 'bag' }], distractors: [{ id: 'leaf' }] };
  assert.deepEqual(scoreFindings(scenario, ['bag', 'leaf', 'bottle', 'leaf']), {
    correct: 2, total: 2, falsePositives: 1, foundIds: ['bottle', 'bag'], missedIds: [], complete: false, accuracy: 2 / 3,
  });
  assert.equal(scoreFindings(scenario, ['bottle', 'bag']).complete, true);
  assert.equal(scoreFindings(scenario, []).accuracy, 0);
});

test('hit testing recognizes natural distractors and chooses the nearest overlapping item', () => {
  const scenario = {
    targets: [{ id: 'fragment', x: 0.4, y: 0.5, radius: 0.1 }],
    distractors: [{ id: 'leaf', x: 0.5, y: 0.5, radius: 0.1 }],
  };
  assert.equal(hitTest(scenario, 0.49, 0.5)?.id, 'leaf');
  assert.equal(hitTest(scenario, 0.49, 0.5)?.kind, 'distractor');
  assert.equal(hitTest(scenario, 0.4, 0.5)?.kind, 'target');
  assert.equal(hitTest(scenario, 0.95, 0.95), null);
  for (const [x, y] of [[-0.1, 0.5], [0.5, 1.1], [NaN, 0.2], [null, 0.2]]) assert.equal(hitTest(scenario, x, y), null);
});

test('daily rotation is stable, advances by date, and rejects normalized invalid dates', () => {
  const first = dailyCase('2026-11-21');
  assert.ok(CASES.includes(first));
  assert.equal(dailyCase('2026-11-21'), first);
  assert.notEqual(dailyCase('2026-11-22'), first);
  assert.equal(dailyCase('2026-11-24'), first);
  assert.ok(dailyCase('2024-02-29'));
  for (const day of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '2026-11-21T00:00:00Z', '', null]) assert.equal(dailyCase(day), null);
});

test('open-dataset cases preserve annotation regions, attribution and unknown physical sizes', () => {
  assert.equal(CASES.length, 3);
  for (const scenario of CASES) {
    const items = [...scenario.targets, ...scenario.distractors];
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
    assert.ok(scenario.targets.length >= 2);
    assert.equal(scenario.sourceType, 'dataset');
    assert.equal(scenario.source.license, 'CC BY 4.0');
    assert.ok(scenario.source.attribution.includes('Lazzerini'));
    assert.equal(scenario.distractors.length, 0);
    for (const item of items) {
      assert.ok(item.clue && item.clue !== item.label);
      assert.equal(hitTest(scenario, item.x, item.y)?.id, item.id);
      assert.equal(item.measuredMm, null);
      assert.equal(item.material, 'Not specified by dataset');
    }
    assert.equal(scoreFindings(scenario, scenario.targets.map((item) => item.id)).complete, true);
  }
});

test('real-photo hit testing uses a published bounding box rather than an oversized circle', () => {
  const scenario = {targets: [{id:'region',x:0.5,y:0.5,radius:0.3,bbox:[0.3,0.45,0.4,0.1]}], distractors: []};
  assert.equal(hitTest(scenario,0.31,0.46)?.id,'region');
  assert.equal(hitTest(scenario,0.5,0.65),null);
});
