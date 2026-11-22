import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {identifyWaterbody, classifyCleanupSite, cleanupPriority, cleanupAction} from '../src/cleanup-site.js';

test('real marine boundaries distinguish a bay, gulf, open ocean and land', () => {
  const {areas} = JSON.parse(readFileSync(new URL('../public/hosted/waterbodies.json', import.meta.url), 'utf8'));
  assert.deepEqual(identifyWaterbody(areas, [-76.3,37.35]), {name:'Chesapeake Bay', type:'bay'});
  assert.equal(identifyWaterbody(areas, [-90,25]).type, 'gulf');
  assert.equal(identifyWaterbody(areas, [-45,35]).type, 'ocean');
  assert.equal(identifyWaterbody(areas, [20,25]), null);
  assert.equal(classifyCleanupSite({location:{type:'ocean'}, evidence:{kind:'river'}}), 'river');
});

test('actions change across locations and severity while unsafe access overrides both', () => {
  const noSurvey = {benefit:null};
  const highRiver = cleanupPriority({evidence:{kind:'river', value:100}}, noSurvey);
  const lowRiver = cleanupPriority({evidence:{kind:'river', value:1}}, noSurvey);
  const severeSPI = cleanupPriority({evidence:{kind:'spi', band:'Severe'}}, noSurvey);
  assert.match(cleanupAction('river', highRiver, false), /interception assessment/);
  assert.match(cleanupAction('river', lowRiver, false), /prevention/);
  assert.match(cleanupAction('offshore', severeSPI, false), /targeted sampling/);
  assert.match(cleanupAction('bay', severeSPI, false), /harbor or coastal manager/);
  assert.match(cleanupAction('shore', {level:'high', kind:'shoreline'}, false), /prioritize/);
  assert.match(cleanupAction('river', highRiver, true), /Pause/);
});
