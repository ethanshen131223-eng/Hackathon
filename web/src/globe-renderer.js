import {Deck,_GlobeView as GlobeView,LinearInterpolator,TRANSITION_EVENTS} from '@deck.gl/core';
import {createGlobeLayers} from './globe-layers.js';
import {normalizeGlobeView,GLOBE_REGIONS,wrapLongitude} from './globe-state.js';
import {protectedAreaSummary} from './protected-area-details.js';

class GlobeInterpolator extends LinearInterpolator {
  initializeProps(start,end){
    return super.initializeProps(start,{...end,longitude:start.longitude+wrapLongitude(end.longitude-start.longitude)});
  }
}
const cameraInterpolator=new GlobeInterpolator(['longitude','latitude','zoom']);
const easeInOut=t=>t*t*(3-2*t);

export async function createGlobeRenderer({container,onViewChange,onSelect,onError,onReady,createDeck=props=>new Deck(props)}) {
  const canvas=container.ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden','true');canvas.tabIndex=-1;container.append(canvas);
  let deck,destroyed=false,startupTimer;
  let commandedView=normalizeGlobeView(GLOBE_REGIONS[0]);
  const motionPreference=container.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionChanged=()=>{
    if(!destroyed&&motionPreference.matches)deck?.setProps({initialViewState:{...commandedView,transitionDuration:0}});
  };
  let places=[];
  try {const response=await fetch('/globe/places.json');if(response.ok)places=(await response.json()).places??[];}catch{ /* Area list and globe remain usable without labels. */ }
  try {
    await new Promise((resolve,reject)=>{
      startupTimer=setTimeout(()=>reject(new Error('Globe graphics initialization timed out.')),15000);
      deck=createDeck({canvas,parent:container,width:'100%',height:'100%',
        views:new GlobeView({id:'conservation-earth',resolution:3,controller:{dragPan:true,dragRotate:false,keyboard:false,doubleClickZoom:true}}),
        // Let Deck track drag and animation frames internally. Layer updates must
        // not reapply an old camera target in the middle of a transition.
        initialViewState:commandedView,
        useDevicePixels:Math.min(globalThis.devicePixelRatio||1,2),
        onViewStateChange:({viewState,interactionState={}})=>{
          if(destroyed)return;
          if(!interactionState.inTransition)commandedView=normalizeGlobeView(viewState);
          onViewChange?.(viewState,interactionState);
        },
        onLoad:()=>{onReady?.();resolve();},
        onError:error=>{onError?.(error);reject(error);},
        getTooltip:info=>info.object?{text:`${info.object.properties.name}\n${protectedAreaSummary(info.object.properties)}`}:null,
        getCursor:({isDragging,isHovering})=>isDragging?'grabbing':isHovering?'pointer':'grab',
        layers:createGlobeLayers({onImageError:onError,places}),
      });
    });
  } catch(error){deck?.finalize();canvas.remove();throw error;}
  finally {clearTimeout(startupTimer);}
  motionPreference?.addEventListener('change',motionChanged);
  return {
    update(state){
      if(destroyed)return;
      const props={layers:createGlobeLayers({...state,places,onSelect,onImageError:onError})};
      const next=normalizeGlobeView(state.view);
      if(['longitude','latitude','zoom'].some(key=>next[key]!==commandedView[key])){
        const distance=Math.hypot(wrapLongitude(next.longitude-commandedView.longitude),next.latitude-commandedView.latitude);
        const zoomDistance=Math.abs(next.zoom-commandedView.zoom);
        const duration=state.animate&&!motionPreference?.matches?Math.min(1100,350+distance*3+zoomDistance*100):0;
        commandedView=next;
        props.initialViewState={...next,transitionDuration:duration,transitionInterpolator:cameraInterpolator,
          transitionEasing:easeInOut,transitionInterruption:TRANSITION_EVENTS.BREAK};
      }
      deck.setProps(props);
    },
    destroy(){if(destroyed)return;destroyed=true;motionPreference?.removeEventListener('change',motionChanged);deck.finalize();canvas.remove();},
  };
}
