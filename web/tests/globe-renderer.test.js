import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {LinearInterpolator,TRANSITION_EVENTS} from '@deck.gl/core';
import {createGlobeRenderer} from '../src/globe-renderer.js';

test('programmatic focus eases with interruption while animation frames and layer updates leave the camera alone',async t=>{
  const window=new Window(),container=window.document.createElement('div');
  const commands=[],cameraEvents=[];let options,finalized=false;
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({places:[]})));
  let renderer;
  try{
    await assert.doesNotReject(async()=>{
      renderer=await createGlobeRenderer({container,onViewChange:(...args)=>cameraEvents.push(args),
        createDeck:props=>{options=props;queueMicrotask(()=>props.onLoad());return {setProps:props=>commands.push(props),finalize:()=>{finalized=true;}};}});
    });
    assert.ok(options.initialViewState);assert.equal(options.viewState,undefined);
    const target={longitude:150,latitude:-20,zoom:.65};
    const state={view:target,features:[],protectedVisible:true,animate:true};
    renderer.update(state);
    const view=commands.at(-1).initialViewState;
    assert.ok(view.transitionDuration>=300);assert.ok(view.transitionDuration<=1500);
    assert.ok(view.transitionInterpolator instanceof LinearInterpolator);
    assert.equal(view.transitionInterruption,TRANSITION_EVENTS.BREAK);
    assert.equal(view.transitionEasing(0),0);assert.equal(view.transitionEasing(1),1);
    const wrapped=view.transitionInterpolator.initializeProps({longitude:179,latitude:0,zoom:1},{longitude:-179,latitude:0,zoom:1});
    assert.equal(wrapped.end.longitude-wrapped.start.longitude,2);
    assert.ok(view.transitionEasing(.1)<.1);assert.ok(view.transitionEasing(.9)>.9);
    options.onViewStateChange({viewState:{longitude:-150,latitude:-10,zoom:.65},interactionState:{inTransition:true}});
    renderer.update({...state,selectedId:'1',features:[]});
    assert.equal(commands.at(-1).initialViewState,undefined);
    assert.equal(cameraEvents.at(-1)[1].inTransition,true);
    const drag={longitude:-135,latitude:-5,zoom:.8};
    options.onViewStateChange({viewState:drag,interactionState:{isDragging:true}});
    renderer.update({...state,view:drag,animate:false});
    assert.equal(commands.at(-1).initialViewState,undefined);
    renderer.update({...state,view:{...drag,zoom:1},animate:false});
    assert.equal(commands.at(-1).initialViewState.transitionDuration,0);
    renderer.destroy();assert.equal(finalized,true);assert.equal(container.children.length,0);
  }finally{renderer?.destroy();window.close();}
});

test('reduced motion disables camera animation and a preference change stops an active flight',async t=>{
  const window=new Window(),container=window.document.createElement('div'),commands=[];
  const preference=new window.EventTarget();preference.matches=true;
  window.matchMedia=()=>preference;
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({places:[]})));
  let renderer;
  try{
    await assert.doesNotReject(async()=>{
      renderer=await createGlobeRenderer({container,onViewChange:()=>{},createDeck:props=>{
        queueMicrotask(()=>props.onLoad());return {setProps:props=>commands.push(props),finalize(){}};
      }});
    });
    const state={view:{longitude:150,latitude:-20,zoom:.65},features:[],animate:true};
    renderer.update(state);assert.equal(commands.at(-1).initialViewState.transitionDuration,0);
    preference.matches=false;preference.dispatchEvent(new window.Event('change'));
    renderer.update({...state,view:{longitude:135,latitude:7,zoom:1}});
    assert.ok(commands.at(-1).initialViewState.transitionDuration>0);
    preference.matches=true;preference.dispatchEvent(new window.Event('change'));
    assert.equal(commands.at(-1).initialViewState.transitionDuration,0);
    assert.equal(commands.at(-1).initialViewState.longitude,135);
    renderer.destroy();const count=commands.length;preference.dispatchEvent(new window.Event('change'));
    assert.equal(commands.length,count);
  }finally{renderer?.destroy();window.close();}
});
