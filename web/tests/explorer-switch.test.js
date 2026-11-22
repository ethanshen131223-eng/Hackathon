import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountExplorerSwitch} from '../src/explorer-switch.js';

test('map and globe share geographic focus and only one panel is active',async()=>{
  const window=new Window({url:'http://localhost/map.html'}),document=window.document;
  document.body.innerHTML='<div id="explorer-switch"></div><main id="pollution-view"></main><section id="conservation-view"></section>';
  let ocean={longitude:145,latitude:-20,zoom:6},globe,disposed=0,mounts=0;
  const shell=mountExplorerSwitch({document,getOceanView:()=>ocean,setOceanView:view=>ocean=view,
    mountGlobe:async(host,{initialView})=>{mounts++;globe={...initialView};return {getView:()=>globe,destroy(){disposed++;}};}});
  try{
    await shell.ready;await shell.selectMode('globe');
    assert.equal(document.getElementById('pollution-view').hidden,true);assert.equal(globe.longitude,145);assert.equal(globe.latitude,-20);
    await shell.selectMode('globe');assert.equal(disposed,0);assert.equal(mounts,1);
    globe={longitude:-28,latitude:38,zoom:2};await shell.selectMode('ocean');
    assert.equal(ocean.longitude,-28);assert.equal(ocean.latitude,38);assert.equal(document.getElementById('conservation-view').hidden,true);assert.equal(disposed,1);
    assert.equal(document.querySelector('[aria-selected="true"]').textContent,'Ocean map');
    assert.equal(new URL(window.location.href).searchParams.get('view'),'ocean');
  }finally{shell.destroy();window.close();}
});

test('reloading an ocean deep link keeps its zoom instead of applying globe conversion',async()=>{
  const window=new Window({url:'http://localhost/map.html?view=ocean&lon=10&lat=40&zoom=7'}),document=window.document;
  document.body.innerHTML='<div id="explorer-switch"></div><main id="pollution-view"></main><section id="conservation-view"></section>';
  let ocean;
  const shell=mountExplorerSwitch({document,getOceanView:()=>ocean,setOceanView:view=>ocean=view,mountGlobe(){throw Error('Unexpected globe');}});
  try{await shell.ready;assert.equal(ocean.zoom,7);assert.equal(ocean.longitude,10);await shell.selectMode('ocean');assert.equal(ocean.zoom,7);}finally{shell.destroy();window.close();}
});

test('a pending globe load cannot replace a newer ocean selection',async()=>{
  const window=new Window({url:'http://localhost/map.html'}),document=window.document;
  document.body.innerHTML='<div id="explorer-switch"></div><main id="pollution-view"></main><section id="conservation-view"></section>';
  let resolve,disposed=0;
  const shell=mountExplorerSwitch({document,getOceanView:()=>({longitude:0,latitude:0,zoom:3}),setOceanView(){},mountGlobe:()=>new Promise(done=>resolve=done)});
  try{
    await shell.ready;const pending=shell.selectMode('globe');await shell.selectMode('ocean');
    resolve({getView:()=>({longitude:0,latitude:0,zoom:0}),destroy(){disposed++;}});await pending;
    assert.equal(document.getElementById('pollution-view').hidden,false);assert.equal(disposed,1);
  }finally{shell.destroy();window.close();}
});

test('globe deep links initialize focus and switching remains usable after a load failure',async()=>{
  const window=new Window({url:'http://localhost/map.html?view=globe&lon=23&lat=-34&zoom=1'}),document=window.document;
  document.body.innerHTML='<div id="explorer-switch"></div><main id="pollution-view"></main><section id="conservation-view"></section>';
  let view;
  const shell=mountExplorerSwitch({document,getOceanView:()=>null,setOceanView(){},mountGlobe:async(_host,options)=>{view=options.initialView;throw Error('Offline');}});
  try{
    await shell.ready;assert.equal(view.longitude,23);assert.equal(view.latitude,-34);
    assert.match(document.getElementById('conservation-view').textContent,/could not load/i);
    await shell.selectMode('ocean');assert.equal(document.getElementById('pollution-view').hidden,false);
  }finally{shell.destroy();window.close();}
});
