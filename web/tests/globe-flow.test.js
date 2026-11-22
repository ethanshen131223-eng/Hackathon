import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {mountGlobeExplorer} from '../src/globe-explorer.js';

const area=(id,name)=>({type:'Feature',id,properties:{name,designation:'Marine reserve',status:'Designated',realm:'Marine',sourceUrl:`https://www.protectedplanet.net/${id}`},geometry:{type:'Polygon',coordinates:[[[179,10],[-179,10],[-179,12],[179,10]]]}});
const collection=features=>({type:'FeatureCollection',features,attribution:'UNEP-WCMC and IUCN source citation',version:'October 2026',truncated:true,maxFeatures:80,geometryGeneralizationDegrees:.03});
function fixture(options={}) {
  const window=new Window({url:'http://localhost/globe.html'}),root=window.document.createElement('main');window.document.body.append(root);
  const frames=[],calls=[];let handlers,disposed=false;
  const controller=mountGlobeExplorer(root,{debounceMs:5,query:async(bounds,opts)=>{calls.push({bounds,opts});return collection([area('1','Island reserve'),area('2','Ocean sanctuary')]);},
    createRenderer:async args=>{handlers=args;return {update:state=>frames.push(state),destroy:()=>{disposed=true;}};},...options});
  return {window,root,controller,frames,calls,get handlers(){return handlers;},get disposed(){return disposed;}};
}

test('conservation flow loads real results, filters, selects details and toggles only protected geometry',async()=>{
  const f=fixture();
  try{
    await f.controller.ready;
    assert.equal(f.root.querySelectorAll('.conservation-result').length,2);
    assert.match(f.root.querySelector('#globe-status').textContent,/partial/i);
    assert.match(f.root.querySelector('#globe-attribution').textContent,/October 2026/);
    const filter=f.root.querySelector('#area-filter');filter.value='Island';filter.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.root.querySelectorAll('.conservation-result').length,1);
    f.root.querySelector('.conservation-result').focus();f.root.querySelector('.conservation-result').click();
    assert.equal(f.window.document.activeElement.textContent.includes('Island reserve'),true);
    assert.equal(f.window.document.activeElement.className,'conservation-result');
    assert.match(f.root.querySelector('#area-details').textContent,/Island reserve/);
    assert.equal(f.root.querySelector('#area-details a').href,'https://www.protectedplanet.net/1');
    assert.ok(Math.abs(f.frames.at(-1).view.longitude)>178);
    const toggle=f.root.querySelector('#conservation-toggle');toggle.click();
    assert.equal(f.frames.at(-1).protectedVisible,false);assert.equal(f.frames.at(-1).features.length,2);
    const select=f.root.querySelector('#globe-region');select.value='coral-sea';select.dispatchEvent(new f.window.Event('change'));
    await delay(15);assert.equal(f.calls.length,2);assert.equal(f.frames.at(-1).view.longitude,150);
    assert.equal(f.calls.at(-1).opts.maxFeatures,80);
    f.controller.destroy();assert.equal(f.disposed,true);
  } finally {f.controller.destroy();f.window.close();}
});

test('outdated requests cannot replace current-area data and camera changes are debounced',async()=>{
  const pending=[];
  const f=fixture({query:(bounds,opts)=>new Promise(resolve=>pending.push({bounds,opts,resolve}))});
  try {
    await delay(0);
    f.handlers.onViewChange({longitude:100,latitude:10,zoom:1});
    f.handlers.onViewChange({longitude:110,latitude:10,zoom:1});
    f.handlers.onViewChange({longitude:120,latitude:10,zoom:1});
    await delay(15);assert.equal(pending.length,2);assert.equal(pending[0].opts.signal.aborted,true);
    pending[1].resolve(collection([area('2','Current region')]));await delay(0);
    pending[0].resolve(collection([area('1','Old region')]));await f.controller.ready;
    assert.match(f.root.querySelector('#conservation-results').textContent,/Current region/);
    assert.doesNotMatch(f.root.querySelector('#conservation-results').textContent,/Old region/);
  } finally {f.controller.destroy();f.window.close();}
});

test('source failure and renderer failure remain recoverable through the region and results browser',async()=>{
  let fail=true;
  const f=fixture({createRenderer:async()=>{throw Error('No WebGL');},query:async()=>{if(fail)throw Error('Offline');return collection([area('1','Recovered reserve')]);}});
  try {
    await f.controller.ready;
    assert.match(f.root.querySelector('#globe-render-status').textContent,/3D globe unavailable/i);
    assert.match(f.root.querySelector('#globe-status').textContent,/unavailable/i);
    assert.doesNotMatch(f.root.querySelector('#conservation-results').textContent,/no protected areas/i);
    fail=false;f.root.querySelector('#retry-conservation').click();await delay(10);
    assert.match(f.root.querySelector('#conservation-results').textContent,/Recovered reserve/);
    assert.equal(f.root.querySelector('#globe-region').disabled,false);
  } finally {f.controller.destroy();f.window.close();}
});

test('keyboard globe controls and reset change the view without moving focus into the canvas',async()=>{
  const f=fixture();
  try{
    await f.controller.ready;const view=f.root.querySelector('#conservation-globe');
    view.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.notEqual(f.frames.at(-1).view.longitude,-90);
    f.root.querySelector('[aria-label="Zoom in"]').click();assert.ok(f.frames.at(-1).view.zoom>.65);
    f.root.querySelector('#reset-globe').click();assert.equal(f.frames.at(-1).view.longitude,-90);
  } finally {f.controller.destroy();f.window.close();}
});

test('selected area shows safe, labeled source details and explicit unknown fields',async()=>{
  const feature=area('1','<img src=x onerror=alert(1)> sanctuary');
  Object.assign(feature.properties,{iucnCategory:'III',statusYear:2005,reportedAreaKm2:1527.97454488,
    reportedMarineAreaKm2:294.76,governance:'Non-profit organisations',managementAuthority:'CONAP',
    noTake:'Not Reported',noTakeAreaKm2:0,countryCodes:'GTM',parentCountryCodes:'GTM'});
  const f=fixture({query:async()=>collection([feature])});
  try{
    await f.controller.ready;f.root.querySelector('.conservation-result').click();
    const details=f.root.querySelector('#area-details');
    const rows=Object.fromEntries([...details.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent]));
    assert.equal(rows['IUCN management category'],'III');assert.equal(rows['Status year'],'2005');
    assert.equal(rows['Reported area'],'1,527.975 km²');assert.equal(rows['Reported marine area'],'294.76 km²');
    assert.equal(rows.Governance,'Non-profit organisations');assert.equal(rows['Management authority'],'CONAP');
    assert.match(rows['No-take coverage'],/not reported/i);assert.match(rows['Reported no-take area'],/not reported/i);
    assert.equal(rows['Country / territory codes'],'GTM');assert.equal(rows['Parent country codes'],'GTM');
    assert.equal(details.querySelector('img'),null);assert.match(details.textContent,/<img src=x/);
    f.handlers.onSelect(area('2','Unknown reserve'));
    assert.match(details.textContent,/Not reported by source/);
    assert.equal(details.querySelectorAll('dd').length,13);
  }finally{f.controller.destroy();f.window.close();}
});

test('animated camera frames preserve selection and do not trigger replacement queries',async()=>{
  const f=fixture();
  try{
    await f.controller.ready;f.root.querySelector('.conservation-result').click();
    assert.equal(f.frames.at(-1).animate,true);
    for(const longitude of [30,60,90])f.handlers.onViewChange({longitude,latitude:11,zoom:2},{inTransition:true});
    await delay(15);
    assert.equal(f.calls.length,1);assert.equal(f.root.querySelectorAll('.conservation-result').length,2);
    assert.match(f.root.querySelector('#area-details').textContent,/Island reserve/);
    assert.equal(f.root.querySelector('#globe-region').value,'galapagos');
    f.handlers.onViewChange({longitude:120,latitude:11,zoom:2},{isDragging:true});
    assert.equal(f.frames.at(-1).animate,false);
    assert.equal(f.root.querySelector('#globe-region').value,'custom');
    await delay(15);assert.equal(f.calls.length,2);
  }finally{f.controller.destroy();f.window.close();}
});
