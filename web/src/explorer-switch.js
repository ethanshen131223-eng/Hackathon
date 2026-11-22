import {normalizeGlobeView} from './globe-state.js';

export function mountExplorerSwitch({document,getOceanView,setOceanView,onOceanVisibility=()=>{},mountGlobe}={}) {
  const window=document.defaultView,events=new window.AbortController(),bar=document.getElementById('explorer-switch');
  const ocean=document.getElementById('pollution-view'),globe=document.getElementById('conservation-view');
  let alive=true,generation=0,runtime=null,lastGlobeView=null,mode='ocean',initialized=false,initialOceanView=null;
  const params=new URLSearchParams(window.location.search),initialMode=params.get('view')==='globe'?'globe':'ocean';
  const longitude=Number(params.get('lon')),latitude=Number(params.get('lat')),zoom=Number(params.get('zoom'));
  if(params.has('lon')&&params.has('lat')&&Number.isFinite(longitude)&&Math.abs(longitude)<=180&&Number.isFinite(latitude)&&Math.abs(latitude)<=85){
    if(initialMode==='globe')lastGlobeView=normalizeGlobeView({longitude,latitude,zoom:params.has('zoom')&&Number.isFinite(zoom)?zoom:.65});
    else initialOceanView={longitude,latitude,zoom:params.has('zoom')&&Number.isFinite(zoom)?Math.max(0,Math.min(18,zoom)):3};
  }
  bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Explorer view');
  const buttons=new Map();
  for(const [id,label,panel]of [['ocean','Ocean map',ocean],['globe','Globe',globe]]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.id=`explorer-${id}-tab`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    button.addEventListener('click',()=>selectMode(id),{signal:events.signal});
    button.addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'ocean':event.key==='End'?'globe':id==='ocean'?'globe':'ocean';buttons.get(next).focus();selectMode(next);}
    },{signal:events.signal});buttons.set(id,button);bar.append(button);
  }
  function updateLocation(view){
    const url=new URL(window.location.href);url.searchParams.set('view',mode);
    if(view)for(const [key,value]of [['lon',view.longitude],['lat',view.latitude],['zoom',view.zoom]])url.searchParams.set(key,String(Number(value.toFixed(4))));
    window.history.replaceState(null,'',url);
  }
  async function selectMode(next){
    if(!alive)return;
    const requested=next==='globe'?'globe':'ocean';
    if(initialized&&requested===mode&&(mode==='ocean'||runtime))return;
    initialized=true;const ticket=++generation;mode=requested;
    onOceanVisibility(mode==='ocean');ocean.hidden=mode!=='ocean';globe.hidden=mode!=='globe';
    for(const [id,button]of buttons){button.setAttribute('aria-selected',String(id===mode));button.tabIndex=id===mode?0:-1;}
    if(mode==='ocean'){
      if(runtime){lastGlobeView=runtime.getView();runtime.destroy();runtime=null;globe.replaceChildren();}
      if(initialOceanView){setOceanView(initialOceanView);initialOceanView=null;}
      else if(lastGlobeView)setOceanView({...lastGlobeView,zoom:Math.max(2,Math.min(13,lastGlobeView.zoom+3))});
      updateLocation(getOceanView());window.dispatchEvent(new window.Event('resize'));return;
    }
    const oceanView=getOceanView();
    const focus=lastGlobeView??(oceanView?normalizeGlobeView({...oceanView,zoom:Math.max(.65,Math.min(4,oceanView.zoom-3))}):undefined);
    updateLocation(focus);
    const message=document.createElement('p');message.className='explorer-loading';message.textContent='Opening the conservation globe…';globe.replaceChildren(message);
    try{
      const create=mountGlobe??(await import('./globe-explorer.js')).mountGlobeExplorer;
      if(!alive||ticket!==generation)return;
      const mounted=await create(globe,{initialView:focus});
      if(!alive||ticket!==generation){mounted.destroy();return;}
      runtime=mounted;
    }catch{if(alive&&ticket===generation){message.textContent='The globe could not load. Switch to Ocean map or try the globe again.';globe.replaceChildren(message);}}
  }
  const ready=selectMode(initialMode);
  globe.addEventListener('click',event=>{if(event.target.closest?.('.globe-map-link')){event.preventDefault();selectMode('ocean');}},{signal:events.signal});
  return {ready,selectMode,destroy(){if(!alive)return;alive=false;generation++;runtime?.destroy();events.abort();bar.replaceChildren();}};
}
