import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {CASES} from '../src/case-content.js';

// DOM integration only: no real browser, layout engine, WebGL or image decoder.
registerHooks({load(url,context,nextLoad){
  if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};
  return nextLoad(url,context);
}});

test('real-photo case flow, daily cap, navigation and earned cosmetic purchase work together',async()=>{
  const window=new Window({url:'http://localhost:5173/#home',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const previous=new Map();
  for(const key of ['window','document','location','localStorage','matchMedia','AbortController','setTimeout','clearTimeout']){
    previous.set(key,globalThis[key]);
    globalThis[key]=['window','document','location','localStorage','AbortController'].includes(key)?(key==='window'?window:window[key]):window[key].bind(window);
  }
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,json:async()=>structuredClone(String(url).includes('day=')?CASES[1]:CASES[0])});
  window.HTMLElement.prototype.scrollIntoView=function(){};
  window.document.write(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await delay(5);}assert.fail('Expected DOM state was not reached');}
  const findButton=text=>[...window.document.querySelectorAll('button')].find(b=>b.textContent===text);
  async function go(hash){window.location.hash=hash;await delay(20);}
  async function finishCurrentCase(draw=false){
    await until(()=>findButton('Check my findings'));
    const photo=window.document.querySelector('.scene-stage > img');
    photo.dispatchEvent(new window.Event('load'));
    assert.match(window.document.querySelector('.case-field-note').textContent,/What to look for/);
    if(draw){
      const stage=window.document.querySelector('.scene-stage');
      stage.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
      const stroke=box=>{
        const [x,y,w,h]=box;
        for(const [type,px,py] of [['pointerdown',x,y],['pointermove',x+w,y],['pointermove',x+w,y+h],['pointerup',x,y+h]])
          stage.dispatchEvent(new window.PointerEvent(type,{clientX:px*1000,clientY:py*1000,pointerId:1,isPrimary:true,button:0,bubbles:true}));
      };
      stroke([.001,.001,.002,.002]);
      findButton('Check my findings').click();
      assert.match(window.document.querySelector('.scene-bottom').textContent,/unmatched outline/i);
      findButton('Undo outline').click();
      for(const target of CASES[0].targets)stroke(target.bbox);
      assert.equal(stage.querySelectorAll('.object-outline').length,CASES[0].targets.length);
      assert.ok([...window.document.querySelectorAll('.clue-list input')].every(input=>input.checked));
      findButton('Undo outline').click();
      assert.equal([...window.document.querySelectorAll('.clue-list input:checked')].length,CASES[0].targets.length-1);
      stroke(CASES[0].targets.at(-1).bbox);
    }else for(const input of window.document.querySelectorAll('.clue-list input'))input.click();
    findButton('Check my findings').click();
    await until(()=>findButton('Review my reasoning'));
    window.document.querySelector('input[value="bounded-observation"]').click();
    for(const value of ['physical-size','polymer','concentration'])window.document.querySelector(`input[name="evidence-limit"][value="${value}"]`).click();
    window.document.querySelector('#reasoning-note').value='I see a manufactured outline. Its material and real size remain uncertain.';
    findButton('Review my reasoning').click();
    await until(()=>[...window.document.querySelectorAll('button')].some(b=>b.textContent.startsWith('Save case')||b.textContent==='Finish daily puzzle'));
    const finish=[...window.document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Save case')||b.textContent==='Finish daily puzzle');finish.click();
    assert.equal(finish.disabled,true);
  }
  try{
    await import('../src/app.js');
    assert.equal(window.document.querySelector('h1').textContent,'Ocean Explorer');
    assert.equal(window.document.querySelector('.hero-actions a[href="/map.html"]').textContent,'Open Ocean Explorer');
    assert.equal(window.document.querySelector('.hero-map-preview').getAttribute('href'),'/map.html');
    await go('#case/random-beginner');await finishCurrentCase(true);
    assert.equal(window.document.getElementById('wallet-balance').textContent,'20');
    const saved=JSON.parse(window.localStorage.getItem('marineguarder.progress.v1'));
    assert.ok(saved.inventory.every(f=>f.userOutline?.length===4));
    await go('#home');await go('#case/random-beginner');await finishCurrentCase();
    assert.equal(window.document.getElementById('wallet-balance').textContent,'20');
    await go('#daily');await finishCurrentCase();
    assert.equal(window.document.getElementById('wallet-balance').textContent,'30');
    await go('#home');await go('#daily');await finishCurrentCase();
    assert.equal(window.document.getElementById('wallet-balance').textContent,'30');
    await go('#collection');await until(()=>findButton('30 sand dollars'));findButton('30 sand dollars').click();
    assert.equal(window.document.getElementById('wallet-balance').textContent,'0');
    assert.equal(window.document.documentElement.style.getPropertyValue('--personal-accent'),'#246cda');
    await go('#play');
    assert.equal(window.document.querySelector('a[href="#shore-cleaner"]').textContent,'Play Shore Cleaner');
    assert.equal(window.document.querySelector('a[data-nav="play"]').textContent,'Arcade');
    for(const key of ['s','e','a']) window.dispatchEvent(new window.KeyboardEvent('keydown',{key}));
    assert.equal(window.location.hash,'#play');
    assert.equal(window.document.querySelector('a[href="#sea"]'),null);
    await go('#sea');await until(()=>window.location.hash==='#play'&&window.document.querySelector('a[href="#shore-cleaner"]'));
    assert.doesNotMatch(window.document.getElementById('main-content').textContent,/Size detective|Follow the food web/);
    assert.match(window.document.getElementById('main-content').textContent,/Random field case/);
  } finally{
    await window.happyDOM.abort();window.close();globalThis.fetch=oldFetch;
    for(const [key,value]of previous)globalThis[key]=value;
  }
});
