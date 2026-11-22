import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readFile} from 'node:fs/promises';
import {mountShoreCleaner} from '../src/shore-cleaner.js';
import {startShoreCleaner} from '../src/shore-cleaner/engine.js';
import {SHORE_MARKUP} from '../src/shore-cleaner/view.js';
import {SHORE_SAVE_KEY,readShoreSave,writeShoreSave} from '../src/shore-cleaner/storage.js';

const storage=initial=>{const values=new Map(Object.entries(initial??{}));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
function fixture({saved={},context=true}={}) {
  const window=new Window({url:'http://localhost/#shore-cleaner'}),root=window.document.createElement('div');window.document.body.append(root);
  const frames=new Map();let next=0,now=0;
  window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};window.cancelAnimationFrame=id=>frames.delete(id);
  const drawing=new Proxy({canvas:null,measureText:text=>({width:String(text).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
    {get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  window.HTMLCanvasElement.prototype.getContext=function(){drawing.canvas=this;return context?drawing:null;};
  const store=storage({[SHORE_SAVE_KEY]:JSON.stringify(saved)});
  return {window,root,store,frames,step(count=1){for(let i=0;i<count;i++){now+=50;const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(now);}}};
}

test('save validation preserves valid progress and rejects malformed or executable stored strings',()=>{
  const store=storage();
  const good={records:{money:100},collection:{'turtle|Common':true},run:{money:50,recycled:6,bag:[{value:5}],upgrades:{speed:1}}};
  assert.equal(writeShoreSave(store,good),true);assert.deepEqual(readShoreSave(store),good);
  for(const bad of ['not json',JSON.stringify({run:{money:Infinity}}),JSON.stringify({run:{money:'<img src=x onerror=alert(1)>'}}),JSON.stringify({run:{bag:Array(1001).fill({value:1})}})]){
    assert.deepEqual(readShoreSave(storage({[SHORE_SAVE_KEY]:bad})),{});
  }
  assert.equal(writeShoreSave({setItem(){throw Error('denied');}},good),false);
});

test('game starts muted, scopes keys to the canvas, pauses and stops its frames on exit',()=>{
  const f=fixture(),shadow=f.root.attachShadow({mode:'open'});shadow.innerHTML=SHORE_MARKUP;
  const game=startShoreCleaner(shadow,{storage:f.store});
  try {
    const canvas=shadow.getElementById('game');
    assert.equal(game.getStatus().started,false);assert.match(shadow.getElementById('sound-btn').textContent,/off|muted/i);
    shadow.getElementById('start-btn').click();assert.equal(game.getStatus().started,true);
    const initial=game.getStatus().player.x;
    const search=f.window.document.createElement('input');f.root.append(search);search.focus();
    const outside=new f.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});search.dispatchEvent(outside);f.step(8);
    assert.equal(outside.defaultPrevented,false);assert.equal(game.getStatus().player.x,initial);
    canvas.focus();canvas.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,composed:true,cancelable:true}));f.step(8);
    assert.ok(game.getStatus().player.x>initial);
    shadow.getElementById('pause-btn').click();assert.equal(game.getStatus().paused,true);
    game.destroy();assert.equal(f.frames.size,0);assert.ok(readShoreSave(f.store).run);
  }finally{game.destroy();f.window.close();}
});

test('a real bin deposit updates recycling progress and the native arcade mount awards a bounded milestone once',()=>{
  const f=fixture({saved:{run:{recycled:8,bag:[{value:5},{value:5}],player:{x:66,y:512,dir:1,walkPhase:0,target:null}}}});
  let awards=0;
  const cleanup=mountShoreCleaner(f.root,{storage:f.store,onAward:id=>{assert.equal(id,'shore-cleaner');awards++;return {reward:5};},notify(){},navigate(){}});
  try{
    const shadow=f.root.querySelector('.shore-game-host').shadowRoot;
    shadow.getElementById('start-btn').click();f.step(20);
    assert.equal(awards,1);assert.match(f.root.querySelector('.shore-reward-status').textContent,/5 sand dollars/);
    f.step(20);assert.equal(awards,1);
    assert.match(shadow.getElementById('stat-money').textContent,/10/);
    assert.match(f.root.textContent,/Arcade|arcade/);
  }finally{cleanup();f.window.close();}
});

test('unsupported canvas leaves recovery and navigation instead of a broken game',()=>{
  const f=fixture({context:false});let route;
  const cleanup=mountShoreCleaner(f.root,{navigate:value=>route=value,storage:f.store});
  try{
    assert.match(f.root.textContent,/Canvas|canvas/);
    [...f.root.querySelectorAll('button')].find(button=>button.textContent==='Back to arcade').click();assert.equal(route,'play');
    assert.equal(f.frames.size,0);
  }finally{cleanup();f.window.close();}
});

test('animation frames retain unchanged upgrade nodes and run checkpoints restore purchases',()=>{
  const f=fixture({saved:{run:{money:100,upgrades:{speed:1},player:{x:320,y:410}}}}),shadow=f.root.attachShadow({mode:'open'});shadow.innerHTML=SHORE_MARKUP;
  const game=startShoreCleaner(shadow,{storage:f.store});
  try{
    const pip=shadow.getElementById('pips-speed').firstElementChild;
    f.step(20);assert.equal(shadow.getElementById('pips-speed').firstElementChild===pip,true);
    assert.match(shadow.getElementById('lvl-speed').textContent,/1/);
    shadow.getElementById('buy-speed').click();game.destroy();
    assert.equal(readShoreSave(f.store).run.upgrades.speed,2);
  }finally{game.destroy();f.window.close();}
});

test('hatching a companion persists its data and restores the equipped pet',()=>{
  const f=fixture(),shadow=f.root.attachShadow({mode:'open'});shadow.innerHTML=SHORE_MARKUP;
  const game=startShoreCleaner(shadow,{storage:f.store});
  try{
    shadow.getElementById('hatch-btn').click();game.destroy();
    const saved=readShoreSave(f.store);assert.equal(saved.run?.petBox.length,1);assert.deepEqual(saved.run.equippedIndexes,[0]);
    const host=f.window.document.createElement('div');f.window.document.body.append(host);const next=host.attachShadow({mode:'open'});next.innerHTML=SHORE_MARKUP;
    const restored=startShoreCleaner(next,{storage:f.store});
    try{assert.match(next.getElementById('companion-info').textContent,/1\/1 equipped/);}finally{restored.destroy();}
  }finally{game.destroy();f.window.close();}
});

test('the integrated engine carries no cloud requests or hard-coded owner code from the attachment',async()=>{
  const source=await readFile(new URL('../src/shore-cleaner/engine.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/new EventSource|fetch\(|ADMIN_CODE|shore-owner-2026|location\.reload/);
});
