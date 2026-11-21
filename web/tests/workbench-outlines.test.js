import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorkbench,mountCreator} from '../src/workbench.js';
import {saveLocalCase,saveLocalPuzzle,loadLocalCase,loadLocalPuzzle} from '../src/local-cases.js';

test('local editors draw, reopen, undo and clear polygon findings while keeping point markers',async()=>{
  const window=new Window(),previous=new Map();
  for(const key of ['document','FormData']){previous.set(key,globalThis[key]);globalThis[key]=window[key];}
  const base={title:'Drawing fixture',createdAt:'2026-11-21T12:00:00Z',imageDataUrl:'data:image/png;base64,aGVsbG8='};
  const marker={id:'center',x:.5,y:.5,radius:.04,label:'Existing marker',category:'uncertain'};
  const findButton=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text||b.textContent.startsWith(text));
  try {
    for(const creator of [false,true]){
      const id=creator?'draw-puzzle':'draw-case',key=creator?'targets':'findings';
      await (creator?saveLocalPuzzle:saveLocalCase)({...base,id,...(creator?{}:{mode:'surface'}),[key]:[{...marker,...(creator?{clue:'Center'}:{quantity:1,sizeMm:null,notes:''})}]});
      const root=window.document.createElement('div');window.document.body.append(root);
      const cleanup=await (creator?mountCreator:mountWorkbench)(root);
      findButton(root,'Open Drawing fixture').click();
      root.querySelector('.annotation-stage img').dispatchEvent(new window.Event('load'));
      const stage=root.querySelector('.annotation-stage');
      stage.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:500});
      const stroke=()=>{
        for(const [type,x,y]of [['pointerdown',100,100],['pointermove',300,100],['pointermove',300,200],['pointerup',100,200]])
          stage.dispatchEvent(new window.PointerEvent(type,{clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,bubbles:true}));
      };
      stroke();assert.equal(stage.querySelectorAll('.object-outline').length,1);
      findButton(root,'Undo outline').click();assert.equal(stage.querySelectorAll('.object-outline').length,0);
      assert.match(root.querySelector('.workbench-details').textContent,/Existing marker/);
      stroke();findButton(root,'Save '+(creator?'puzzle':'case')+' on this device').click();
      await new Promise(resolve=>setTimeout(resolve,20));
      const entry=await (creator?loadLocalPuzzle:loadLocalCase)(id);
      assert.equal(entry[key].length,2);assert.equal(entry[key][1].outline.length,4);
      findButton(root,'Open Drawing fixture').click();root.querySelector('.annotation-stage img').dispatchEvent(new window.Event('load'));
      assert.equal(stage.querySelectorAll('.object-outline').length,1);
      findButton(root,'Clear outlines').click();assert.equal(stage.querySelectorAll('.object-outline').length,0);
      assert.match(root.querySelector('.workbench-details').textContent,/Existing marker/);
      cleanup();root.remove();
    }
  } finally {for(const [key,value]of previous)globalThis[key]=value;window.close();}
});

async function creatorTestFixture() {
  const window=new Window(),previous=new Map();
  for(const key of ['document','FormData']){previous.set(key,globalThis[key]);globalThis[key]=window[key];}
  await saveLocalPuzzle({id:'test-outline-actions',title:'Test outline actions',createdAt:'2026-11-21T12:00:00Z',
    imageDataUrl:'data:image/png;base64,aGVsbG8=',targets:[
      {id:'first',x:.2,y:.2,radius:.1,label:'First circle',category:'uncertain',clue:'Upper left'},
      {id:'second',x:.5,y:.2,radius:.1,label:'Second circle',category:'uncertain',clue:'Upper middle'},
      {id:'point',x:.8,y:.8,radius:.1,label:'Point target',category:'uncertain',clue:'Lower right',
        outline:[{x:.7,y:.7},{x:.9,y:.7},{x:.9,y:.9},{x:.7,y:.9}]},
    ]});
  const root=window.document.createElement('div');window.document.body.append(root);
  const cleanup=await mountCreator(root);
  const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text||b.textContent.startsWith(text));
  button('Open Test outline actions').click();
  root.querySelector('.annotation-stage img').dispatchEvent(new window.Event('load'));
  const stage=root.querySelector('.annotation-stage');
  stage.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
  button('Test puzzle').click();
  return {root,stage,button,
    stroke(x,y,width=200,height=200){
      for(const [type,px,py]of [['pointerdown',x,y],['pointermove',x+width,y],['pointermove',x+width,y+height],['pointerup',x,y+height]])
        stage.dispatchEvent(new window.PointerEvent(type,{clientX:px,clientY:py,pointerId:1,isPrimary:true,button:0,bubbles:true}));
    },
    point(x,y){
      button('Point / select').click();
      stage.dispatchEvent(new window.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
      button('Draw outline').click();
    },
    close(){cleanup();for(const [key,value]of previous)globalThis[key]=value;window.close();},
  };
}

test('creator testing renders user outlines around circular targets and undoes the last stroke',async()=>{
  const f=await creatorTestFixture();
  try {
    f.stroke(100,100);f.stroke(400,100);
    assert.equal(f.stage.querySelectorAll('.object-outline').length,2);
    assert.equal(f.button('Undo outline').disabled,false);
    f.button('Undo outline').click();
    assert.equal(f.stage.querySelectorAll('.object-outline').length,1);
    assert.equal(f.stage.querySelector('.object-outline').getAttribute('points'),'100,100 300,100 300,300 100,300');
    assert.equal(f.stage.querySelectorAll('.marker').length,1);
    assert.match(f.root.textContent,/1 of 3 targets found/);
    f.button('Undo outline').click();
    assert.equal(f.stage.querySelectorAll('.object-outline').length,0);
    assert.equal(f.stage.querySelectorAll('.marker').length,0);
    assert.equal(f.button('Undo outline').disabled,true);
  } finally {f.close();}
});

test('creator testing keeps point discoveries when outlines are undone or cleared',async()=>{
  const f=await creatorTestFixture();
  try {
    f.point(800,800);
    assert.equal(f.button('Undo outline').disabled,true);
    assert.equal(f.button('Clear outlines').disabled,true);
    f.stroke(100,100);f.button('Undo outline').click();
    assert.equal(f.stage.querySelectorAll('.marker').length,1);
    assert.match(f.root.textContent,/1 of 3 targets found/);
    f.stroke(100,100);f.stroke(400,100);f.button('Clear outlines').click();
    assert.equal(f.stage.querySelectorAll('.object-outline').length,0);
    assert.equal(f.stage.querySelectorAll('.marker').length,1);
    assert.match(f.root.textContent,/1 of 3 targets found/);
    assert.equal(f.button('Clear outlines').disabled,true);
    f.button('Return to editor').click();
    assert.equal(f.stage.querySelectorAll('.marker').length,3);
    assert.equal(f.stage.querySelector('.object-outline').getAttribute('points'),'700,700 900,700 900,900 700,900');
    f.button('Test puzzle').click();
    assert.equal(f.stage.querySelectorAll('.object-outline').length,0);
    assert.equal(f.stage.querySelectorAll('.marker').length,0);
  } finally {f.close();}
});

test('creator testing retains unmatched strokes so they can be removed',async()=>{
  const f=await creatorTestFixture();
  try {
    f.stroke(50,700,100,100);
    assert.equal(f.stage.querySelectorAll('.object-outline.unmatched').length,1);
    assert.equal(f.stage.querySelectorAll('.marker').length,0);
    assert.equal(f.button('Undo outline').disabled,false);
    f.button('Undo outline').click();
    assert.equal(f.stage.querySelectorAll('.object-outline').length,0);
    assert.match(f.root.textContent,/0 of 3 targets found/);
  } finally {f.close();}
});
