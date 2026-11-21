import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReasoning} from '../src/case-reasoning.js';

test('reasoning separates supported identification from unmeasured material, size and concentration',()=>{
  const result=checkReasoning({evidenceChoice:'bounded-observation',limitChoices:['physical-size','polymer','concentration'],note:'The manufactured shape is a clue; a scale and material test are absent.'});
  assert.equal(result.ready,true);
  assert.equal(result.noteAssessment,'stored-not-graded');
});

test('certainty claims, missing limitations and an empty observation cannot complete a case',()=>{
  for(const values of [
    {evidenceChoice:'confirmed-polymer',limitChoices:['physical-size','polymer','concentration'],note:'This looks manufactured, but could be a reflection.'},
    {evidenceChoice:'bounded-observation',limitChoices:['physical-size'],note:'This looks manufactured, but could be a reflection.'},
    {evidenceChoice:'bounded-observation',limitChoices:['physical-size','polymer','concentration','image-locations'],note:'This looks manufactured, but could be a reflection.'},
    {evidenceChoice:'bounded-observation',limitChoices:['physical-size','polymer','concentration'],note:''},
  ])assert.equal(checkReasoning(values).ready,false);
});
