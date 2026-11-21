import test from 'node:test';
import assert from 'node:assert/strict';
import * as geometry from '../src/outlines.js';
import {hitTest} from '../src/case-content.js';
import {targetAtPoint} from '../src/workbench.js';
import {createLocalRepository} from '../src/local-cases.js';

const rectangle = (x,y,w,h) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const outline = rectangle(0.2,0.3,0.2,0.1);

test('outlines validate bounded finite vertices, reject taps and cap stored complexity', () => {
  assert.deepEqual(geometry.validOutline(outline), outline);
  for (const bad of [[],outline.slice(0,2),[{x:0,y:0},{x:.1,y:.1},{x:.2,y:.2}],
    [{x:-.1,y:0},...outline], [{x:NaN,y:.1},...outline], Array(602).fill(outline[0])]) {
    assert.equal(geometry.validOutline(bad), null);
  }
});

test('polygon hit testing follows the outline rather than its surrounding circle', () => {
  const target={id:'a',x:.3,y:.35,radius:.2,outline};
  assert.equal(geometry.pointInOutline({x:.25,y:.35},outline),true);
  assert.equal(geometry.pointInOutline({x:.2,y:.3},outline),true);
  assert.equal(geometry.pointInOutline({x:.3,y:.45},outline),false);
  assert.equal(hitTest({targets:[target],distractors:[]},.3,.45),null);
  assert.equal(hitTest({targets:[target],distractors:[]},.25,.35)?.id,'a');
  assert.equal(targetAtPoint([target],{x:.3,y:.45}),null);
});

test('outline matching accepts a close region and rejects whole-image or disjoint guesses', () => {
  const item={targets:[{id:'a',x:.3,y:.35,bbox:[.2,.3,.2,.1]}],distractors:[]};
  assert.equal(geometry.matchOutline(item,rectangle(.19,.29,.22,.12))?.id,'a');
  assert.equal(geometry.matchOutline(item,rectangle(0,0,1,1)),null);
  assert.equal(geometry.matchOutline(item,rectangle(.7,.7,.1,.1)),null);
  assert.equal(geometry.matchOutline(item,[]),null);
});

test('manual and authored outlines round trip and invalid polygons are rejected',async()=>{
  const records={cases:[],puzzles:[]};
  const persistence={async list(kind){return structuredClone(records[kind]);},async put(kind,entry){records[kind].push(structuredClone(entry));}};
  const repo=createLocalRepository({persistence});
  const common={id:'local',title:'Outline case',createdAt:'2026-11-21T12:00:00Z',imageDataUrl:'data:image/png;base64,aGVsbG8='};
  const finding={id:'object',x:.3,y:.35,radius:.05,label:'Possible debris',category:'uncertain',outline};
  await repo.saveCase({...common,mode:'surface',findings:[{...finding,quantity:1,sizeMm:null,notes:'Visual outline only.'}]});
  await repo.savePuzzle({...common,targets:[{...finding,clue:'Look near the edge.'}]});
  const reopened=createLocalRepository({persistence});
  assert.deepEqual((await reopened.loadCase('local')).findings[0].outline,outline);
  assert.deepEqual((await reopened.loadPuzzle('local')).targets[0].outline,outline);
  await assert.rejects(repo.savePuzzle({...common,targets:[{...finding,clue:'',outline:[{x:2,y:0},...outline]}]}),/outline/i);
});
