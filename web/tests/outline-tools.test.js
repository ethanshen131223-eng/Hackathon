import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import * as tools from '../src/outline-tools.js';

function fixture() {
  const window=new Window(),stage=window.document.createElement('div');window.document.body.append(stage);
  stage.getBoundingClientRect=()=>({left:100,top:200,width:400,height:200});
  const completed=[],points=[];let undos=0,clears=0;
  const ui=tools.mountOutlineTools(stage,{onOutline:path=>completed.push(path),onPoint:p=>points.push(p),onUndo:()=>undos++,onClear:()=>clears++});
  window.document.body.prepend(ui.toolbar);
  const pointer=(type,x,y,extra={})=>stage.dispatchEvent(new window.PointerEvent(type,{clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,bubbles:true,...extra}));
  const click=text=>[...ui.toolbar.querySelectorAll('button')].find(b=>b.textContent===text).click();
  return {window,stage,ui,completed,points,pointer,click,get undos(){return undos;},get clears(){return clears;}};
}

test('a drag previews and closes a normalized outline, with undo and clear controls',()=>{
  const f=fixture();
  try {
    f.pointer('pointerdown',140,240);f.pointer('pointermove',260,240);f.pointer('pointermove',260,320);
    assert.ok(f.stage.querySelector('.outline-preview').getAttribute('points'));
    f.pointer('pointerup',140,320);
    assert.deepEqual(f.completed[0],[{x:.1,y:.2},{x:.4,y:.2},{x:.4,y:.6},{x:.1,y:.6}]);
    f.ui.setOutlines([{points:f.completed[0]}]);
    assert.equal(f.stage.querySelectorAll('.object-outline').length,1);
    f.click('Undo outline');f.click('Clear outlines');assert.equal(f.undos,1);assert.equal(f.clears,1);
    f.ui.destroy();assert.equal(f.stage.querySelector('svg'),null);
    f.pointer('pointerdown',140,240);f.pointer('pointerup',260,320);assert.equal(f.completed.length,1);
  } finally {f.window.close();}
});

test('cancelled, tiny, secondary and disabled gestures do not add outlines; point mode still works',()=>{
  const f=fixture();
  try {
    f.pointer('pointerdown',140,240);f.pointer('pointermove',260,240);f.pointer('pointercancel',260,320);
    f.pointer('pointerdown',140,240);f.pointer('pointerup',141,241);
    f.pointer('pointerdown',140,240,{isPrimary:false});f.pointer('pointerup',260,320);
    assert.equal(f.completed.length,0);
    f.click('Point / select');f.stage.dispatchEvent(new f.window.MouseEvent('click',{clientX:300,clientY:300,bubbles:true}));
    assert.deepEqual(f.points,[{x:.5,y:.5}]);
    f.ui.setEnabled(false);f.stage.dispatchEvent(new f.window.MouseEvent('click',{clientX:300,clientY:300,bubbles:true}));
    assert.equal(f.points.length,1);assert.ok([...f.ui.toolbar.querySelectorAll('button')].every(b=>b.disabled));
    f.ui.destroy();
  } finally {f.window.close();}
});

test('pointer capture bounds strokes to the photo and Escape abandons the live stroke',()=>{
  const f=fixture();
  try {
    f.pointer('pointerdown',140,240);f.pointer('pointermove',900,240);f.pointer('pointermove',900,500);f.pointer('pointerup',140,500);
    assert.ok(f.completed[0].every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
    f.pointer('pointerdown',140,240);f.pointer('pointermove',260,240);
    f.window.document.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape'}));f.pointer('pointerup',260,320);
    assert.equal(f.completed.length,1);f.ui.destroy();
  } finally {f.window.close();}
});
