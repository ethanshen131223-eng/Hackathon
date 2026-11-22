import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {assessCleanup, estimateCleanup, mountCleanupPlanner} from '../src/cleanup-planner.js';

const today = Date.parse('2026-11-21T17:00:00Z');
const site = {
  observedOn: '2026-11-15', items: 50, length: 50, habitat: 'near',
  access: 'confirmed', wind: 'suitable', water: 'suitable', distance: 10, cost: 25, budget: 100,
};

test('known evidence yields separate benefit and feasibility scores', () => {
  assert.deepEqual(assessCleanup(site, today), {
    density: 100, benefit: 100, feasibility: 78, status: 'Ready for comparison', priority: 89,
  });
});

test('stale surveys, closed sites, unsafe conditions and missing costs stay unranked', () => {
  for (const change of [
    {observedOn: '2026-10-21'}, {access: 'closed'}, {water: 'unsafe'},
    {wind: ''}, {cost: null}, {cost: 101}, {items: 0}, {length: 0}, {habitat: ''},
  ]) assert.equal(assessCleanup({...site, ...change}, today).priority, null);
});

test('the reduction uses surveyed litter and a recovery assumption, with a site-specific next step', () => {
  const estimate = estimateCleanup(site, 45, today);
  assert.deepEqual(estimate.result, {before:50, removed:22, remaining:28, beforeDensity:100, afterDensity:56});
  assert.match(estimate.suggestion, /protected-area manager/);
  assert.equal(estimateCleanup({context:'Severe SPI'}, 50, today).result, null);
  assert.match(estimateCleanup({...site, water:'unsafe'}, 50, today).suggestion, /Pause/);
});

test('a survey tile becomes candidate context and the candidate survives reload', () => {
  const window = new Window({url: 'http://localhost', settings: {
    disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
  }});
  const previous = {document: globalThis.document, localStorage: globalThis.localStorage};
  try {
    Object.assign(globalThis, {document: window.document, localStorage: window.localStorage});
    const html = readFileSync(new URL('../map.html', import.meta.url), 'utf8');
    window.document.body.innerHTML = html;
    const root = window.document.querySelector('#cleanup-planner');
    const planner = mountCleanupPlanner(root);
    const name = root.querySelector('.cleanup-fields input');
    assert.equal(planner.stageTile('Example beach', 'Ocean context · Medium SPI'), true);
    assert.equal(name.value, 'Example beach');
    name.value = 'Edited beach';
    name.dispatchEvent(new window.Event('input', {bubbles: true}));
    assert.equal(planner.stageTile('Second beach', 'Ocean context · Medium SPI'), false);
    assert.equal(name.value, 'Edited beach');
    planner.reviewTile(true);
    assert.equal(name.value, 'Second beach');
    assert.equal(root.querySelector('#cleanup-improvement').hidden, false);
    assert.match(root.querySelector('#cleanup-estimate-results').textContent, /Second beach.*Suggested next step/);
    root.querySelector('form').dispatchEvent(new window.Event('submit', {cancelable: true}));
    assert.match(root.querySelector('.cleanup-results').textContent, /Second beach.*Medium SPI/);
    assert.match(root.querySelector('.cleanup-results').textContent, /Priority pending/);
    window.document.body.innerHTML = html;
    const reloaded = window.document.querySelector('#cleanup-planner');
    mountCleanupPlanner(reloaded);
    assert.match(reloaded.querySelector('.cleanup-results').textContent, /Second beach.*Medium SPI/);
  } finally {
    Object.assign(globalThis, previous);
    window.happyDOM.abort();
  }
});
