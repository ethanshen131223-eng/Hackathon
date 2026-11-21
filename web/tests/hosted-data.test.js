import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseHostedCase,selectHostedPollution,tileAtPoint} from '../src/hosted-data.js';
import {createBasemapLayers} from '../src/basemap.js';

test('hosted cases draw from actually bundled sourced images and daily selection is stable',async()=>{
  const document=JSON.parse(await readFile(new URL('../public/hosted/cases.json',import.meta.url)));
  const first=chooseHostedCase(document,{difficulty:'beginner',rng:()=>0});
  assert.ok(first.sceneUrl.startsWith('/hosted/photos/'));assert.equal(first.source.poolSize,document.cases.length);
  const second=chooseHostedCase(document,{difficulty:'beginner',exclude:[first.id],rng:()=>0});assert.notEqual(second.id,first.id);
  assert.equal(chooseHostedCase(document,{day:'2026-11-21'}).id,chooseHostedCase(document,{day:'2026-11-21'}).id);
  assert.ok(chooseHostedCase(document,{difficulty:'explorer'}).source.hostedSnapshot);
});

test('snapshot selection preserves observed data, filters coverage, and never assigns unknown water a value',()=>{
  const tile={type:'Feature',id:'one',properties:{densityPiecesKm2:123,center:[1,1]},geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]],[[.8,.8],[1.2,.8],[1.2,1.2],[.8,1.2],[.8,.8]]]}};
  const document={exportedAt:'2026-11-21',snapshots:[{bounds:[0,0,2,2],tiles:{features:[tile],metadata:{resolutionKm2:25}},gradient:{frames:[{bounds:[0,0,2,2],image:'fixture'}]}}]};
  const selected=selectHostedPollution(document,[-1,-1,3,3]);
  assert.equal(selected.tiles.features[0].properties.densityPiecesKm2,123);
  assert.equal(selected.tiles.metadata.precomputedSnapshot,true);
  assert.equal(tileAtPoint(selected.tiles,[.5,.5]),tile);
  assert.equal(tileAtPoint(selected.tiles,[1,1]),null);assert.equal(tileAtPoint(selected.tiles,[5,5]),null);
  assert.equal(selectHostedPollution(document,[50,50,60,60]).tiles.features.length,0);
});

test('the no-key map has natural imagery and name labels with a consistent tint',()=>{
  const layers=createBasemapLayers({places:[{name:'Ocean',kind:'water',rank:1,position:[0,0]}],zoom:3});
  assert.equal(layers[0].id,'natural-earth-background');assert.deepEqual(layers[0].props.tintColor,[255,255,255]);
  assert.equal(layers[0].props.pickable,false);assert.equal(layers[1].props.getText(layers[1].props.data[0]),'Ocean');
});
