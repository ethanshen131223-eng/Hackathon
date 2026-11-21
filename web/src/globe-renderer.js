import {Deck,_GlobeView as GlobeView} from '@deck.gl/core';
import {createGlobeLayers} from './globe-layers.js';
import {normalizeGlobeView,GLOBE_REGIONS} from './globe-state.js';

export async function createGlobeRenderer({container,onViewChange,onSelect,onError,onReady}) {
  const canvas=container.ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden','true');canvas.tabIndex=-1;container.append(canvas);
  let deck,destroyed=false,startupTimer;
  let places=[];
  try {const response=await fetch('/globe/places.json');if(response.ok)places=(await response.json()).places??[];}catch{ /* Area list and globe remain usable without labels. */ }
  try {
    await new Promise((resolve,reject)=>{
      startupTimer=setTimeout(()=>reject(new Error('Globe graphics initialization timed out.')),15000);
      deck=new Deck({canvas,parent:container,width:'100%',height:'100%',
        views:new GlobeView({id:'conservation-earth',resolution:3,controller:{dragPan:true,dragRotate:false,keyboard:false,doubleClickZoom:true}}),
        viewState:normalizeGlobeView(GLOBE_REGIONS[0]),
        useDevicePixels:Math.min(globalThis.devicePixelRatio||1,2),
        onViewStateChange:({viewState})=>{onViewChange(viewState);},
        onLoad:()=>{onReady?.();resolve();},
        onError:error=>{onError?.(error);reject(error);},
        getTooltip:info=>info.object?{text:info.object.properties.name}:null,
        getCursor:({isDragging,isHovering})=>isDragging?'grabbing':isHovering?'pointer':'grab',
        layers:createGlobeLayers({onImageError:onError,places}),
      });
    });
  } catch(error){deck?.finalize();canvas.remove();throw error;}
  finally {clearTimeout(startupTimer);}
  return {
    update(state){
      if(destroyed)return;
      deck.setProps({viewState:state.view,layers:createGlobeLayers({...state,places,onSelect,onImageError:onError})});
    },
    destroy(){if(destroyed)return;destroyed=true;deck.finalize();canvas.remove();},
  };
}
