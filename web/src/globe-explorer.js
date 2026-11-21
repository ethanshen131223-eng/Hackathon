import {queryProtectedAreas,PROTECTED_AREAS_SOURCE_URL} from './protected-areas.js';
import {GLOBE_REGIONS,normalizeGlobeView,globeQueryBounds,featureFocus,filterGlobeFeatures,coordinateLabel} from './globe-state.js';

export function mountGlobeExplorer(container,{query=queryProtectedAreas,createRenderer,debounceMs=650}={}) {
  const document=container.ownerDocument;
  const events=new document.defaultView.AbortController(),eventOptions={signal:events.signal};
  let alive=true,renderer=null,request=null,timer=null,generation=0,features=[],selectedId=null;
  let view=normalizeGlobeView(GLOBE_REGIONS[0]),protectedVisible=true,currentRegion=GLOBE_REGIONS[0].id;
  const el=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
  const sourceLink=(text,url)=>{
    const link=el('a','',text);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;
  };
  const button=(text,action,className='button button-secondary')=>{
    const node=el('button',className,text);node.type='button';node.addEventListener('click',action,eventOptions);return node;
  };
  const root=el('div','conservation-explorer');
  const intro=el('div','globe-intro'),introText=el('div');
  introText.append(el('h1','','Explore the ocean’s protected places.'),el('p','','Turn the globe. Choose a region. Discover the marine and coastal areas recorded by Protected Planet.'));
  const mapLink=el('a','globe-map-link','Open the ocean pollution map');mapLink.href='/map.html';intro.append(introText,mapLink);
  const workspace=el('div','globe-workspace');
  const visual=el('section','globe-visual');visual.setAttribute('aria-label','Conservation globe and controls');
  const viewport=el('div','globe-viewport');viewport.id='conservation-globe';viewport.tabIndex=0;viewport.setAttribute('role','region');
  viewport.setAttribute('aria-label','Interactive Earth. Drag to rotate, scroll to zoom, or use arrow keys and plus or minus. Select areas in the list for keyboard access.');
  const rendererStatus=el('p','globe-render-status','Preparing the globe…');rendererStatus.id='globe-render-status';rendererStatus.setAttribute('role','status');
  const caption=el('div','globe-caption');caption.append(el('span','globe-instruction','Drag to rotate · Scroll to zoom'),el('span','globe-center'));
  const coordinates=caption.lastElementChild;
  const controls=el('div','globe-controls');controls.setAttribute('aria-label','Globe navigation');
  const control=(symbol,label,action)=>{const node=button(symbol,action,'globe-control');node.setAttribute('aria-label',label);node.title=label;controls.append(node);return node;};
  control('+','Zoom in',()=>move({zoom:view.zoom+.5}));
  control('−','Zoom out',()=>move({zoom:view.zoom-.5}));
  control('←','Rotate west',()=>move({longitude:view.longitude-rotationStep()}));
  control('→','Rotate east',()=>move({longitude:view.longitude+rotationStep()}));
  control('↑','Rotate north',()=>move({latitude:view.latitude+rotationStep()}));
  control('↓','Rotate south',()=>move({latitude:view.latitude-rotationStep()}));
  const reset=button('Reset view',()=>chooseRegion(GLOBE_REGIONS[0].id),'globe-reset');reset.id='reset-globe';controls.append(reset);
  const legend=el('div','globe-legend');legend.append(el('span','protected-swatch'),el('span','','Protected-area boundary'),el('span','selected-swatch'),el('span','','Selected area'));
  visual.append(viewport,caption,rendererStatus,controls,legend);

  const browser=el('aside','conservation-browser');browser.setAttribute('aria-label','Explore conservation areas');
  const regionLabel=el('label','globe-label','Start somewhere');regionLabel.htmlFor='globe-region';
  const region=el('select');region.id='globe-region';
  for(const place of GLOBE_REGIONS){const option=el('option','',place.name);option.value=place.id;region.append(option);}
  const customOption=el('option','','Current globe view');customOption.value='custom';customOption.hidden=true;region.append(customOption);
  region.addEventListener('change',()=>chooseRegion(region.value),eventOptions);
  const random=button('Surprise me',()=>{
    const choices=GLOBE_REGIONS.filter(place=>place.id!==currentRegion);chooseRegion(choices[Math.floor(Math.random()*choices.length)].id);
  });
  const regionRow=el('div','region-row');regionRow.append(region,random);
  const toggleLabel=el('label','conservation-toggle'),toggle=el('input');toggle.id='conservation-toggle';toggle.type='checkbox';toggle.checked=true;
  toggle.addEventListener('change',()=>{protectedVisible=toggle.checked;updateRenderer();},eventOptions);
  toggleLabel.append(toggle,el('span','','Show protected boundaries'));
  const status=el('p','globe-query-status');status.id='globe-status';status.setAttribute('role','status');
  const scope=el('p','globe-query-scope');scope.id='globe-query-scope';
  const retry=button('Refresh this area',()=>loadAreas(),'button button-secondary globe-refresh');retry.id='retry-conservation';
  const filterLabel=el('label','globe-label','Filter loaded areas');filterLabel.htmlFor='area-filter';
  const filter=el('input');filter.id='area-filter';filter.type='search';filter.placeholder='Name or designation';filter.maxLength=100;
  filter.addEventListener('input',renderList,eventOptions);
  const listHeading=el('h2','globe-list-heading','Areas to explore'),results=el('div','conservation-results');results.id='conservation-results';
  const details=el('section','area-details');details.id='area-details';details.setAttribute('aria-label','Selected conservation area');
  browser.append(regionLabel,regionRow,toggleLabel,status,scope,retry,filterLabel,filter,listHeading,results,details);
  workspace.append(visual,browser);
  const sources=el('section','globe-sources');
  const attribution=el('p');attribution.id='globe-attribution';
  attribution.append(sourceLink('Protected Planet',PROTECTED_AREAS_SOURCE_URL),document.createTextNode(' / UNEP-WCMC and IUCN. Waiting for the live layer citation.'));
  const limitations=el('p','','This explorer shows marine and coastal protected-area polygons returned near the globe center, not every conservation area worldwide. Missing boundaries do not mean an area is unprotected. Boundaries are simplified for display; a designation does not establish enforcement, ecosystem condition or pollution levels.');
  const earthCredit=el('p');earthCredit.append(sourceLink('Natural Earth basemap','https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-1/'),document.createTextNode(' · Historical land cover and relief, not current satellite imagery. '),sourceLink('Image provenance','/globe/provenance.json'));
  sources.append(attribution,limitations,earthCredit);root.append(intro,workspace,sources);container.replaceChildren(root);

  function rotationStep(){return Math.max(1,12/2**Math.max(0,view.zoom-1));}
  function updateRenderer(){coordinates.textContent=`Centered at ${coordinateLabel(view)}`;renderer?.update({view,features,selectedId,protectedVisible});}
  function clearDetails(){details.replaceChildren(el('h2','','Choose a protected area'),el('p','','Select a shaded boundary or an area in the list to read its source details.'));}
  function renderList(){
    results.replaceChildren();const matches=filterGlobeFeatures(features,filter.value);
    listHeading.textContent=features.length?`Areas to explore (${matches.length} of ${features.length})`:'Areas to explore';
    if(!matches.length)results.append(el('p','globe-list-empty',features.length?'No loaded names match. Try another name or clear the filter.':'No boundaries loaded. Choose a region or refresh the connection.'));
    for(const feature of matches){
      const choice=button('',()=>selectFeature(feature),'conservation-result');
      choice.setAttribute('aria-pressed',String(feature.id===selectedId));
      choice.append(el('strong','',feature.properties.name),el('small','',feature.properties.designation??'Designation not supplied'));
      results.append(choice);
    }
  }
  function selectFeature(feature){
    selectedId=feature.id;const focus=featureFocus(feature);if(focus)view=focus;
    details.replaceChildren(el('span','area-source-label','Protected Planet record'),el('h2','',feature.properties.name));
    const dl=el('dl');
    for(const [label,value]of [['Designation',feature.properties.designation],['Source status',feature.properties.status],['Realm',feature.properties.realm]])dl.append(el('dt','',label),el('dd','',value??'Not supplied'));
    details.append(dl);
    if(/^https:\/\/www\.protectedplanet\.net\//.test(feature.properties.sourceUrl??''))details.append(sourceLink('View the Protected Planet record',feature.properties.sourceUrl));
    details.append(el('p','area-limits','Source-reported designation and status. Check the original record for site rules and management information.'));
    renderList();updateRenderer();
  }
  function move(patch){
    view=normalizeGlobeView({...view,...patch});currentRegion='custom';customOption.hidden=false;region.value='custom';
    updateRenderer();scheduleQuery();return view;
  }
  function chooseRegion(id){
    const place=GLOBE_REGIONS.find(item=>item.id===id);if(!place)return;
    currentRegion=id;region.value=id;view=normalizeGlobeView(place);filter.value='';updateRenderer();loadAreas();
  }
  function invalidate(){generation++;request?.abort();clearTimeout(timer);timer=null;}
  function scheduleQuery(){
    invalidate();features=[];selectedId=null;clearDetails();renderList();updateRenderer();
    status.textContent='Globe moved. Loading boundaries near the new center…';
    timer=setTimeout(()=>loadAreas(),debounceMs);
  }
  async function loadAreas(){
    if(!alive)return;invalidate();const ticket=generation;
    const controller=new AbortController();request=controller;
    features=[];selectedId=null;renderList();clearDetails();updateRenderer();
    const bounds=globeQueryBounds(view),generalizationDegrees=view.zoom>=4?.003:.03;
    status.textContent='Loading marine and coastal boundaries…';results.setAttribute('aria-busy','true');
    scope.textContent=`Search extent: ${bounds.map(number=>number.toFixed(1)).join(', ')}° (west, south, east, north)${bounds[0]>bounds[2]?'; crosses the date line':''}.`;
    attribution.replaceChildren(sourceLink('Protected Planet',PROTECTED_AREAS_SOURCE_URL),document.createTextNode(' / UNEP-WCMC and IUCN. Loading live source citation.'));
    try {
      const data=await query(bounds,{signal:controller.signal,maxFeatures:80,generalizationDegrees});
      if(!alive||controller.signal.aborted||ticket!==generation)return;
      features=data.features;
      status.textContent=features.length?`${features.length} boundaries near the globe center.${data.truncated?' Partial results; zoom in to narrow the search.':''}`:'No marine/coastal polygons were returned for this search extent. This does not establish that the region is unprotected.';
      const checkedAt=new Date().toISOString();
      attribution.replaceChildren(document.createTextNode(`${data.attribution} Layer release: ${data.version}. Fetched ${checkedAt.slice(0,10)} at ${checkedAt.slice(11,16)} UTC. Geometry generalized to ${data.geometryGeneralizationDegrees}°. `),sourceLink('Source and data terms',data.sourceUrl??PROTECTED_AREAS_SOURCE_URL));
      renderList();updateRenderer();
    } catch(error){
      if(!alive||ticket!==generation||controller.signal.aborted)return;
      status.textContent='Protected-area data unavailable. Check the connection, choose a smaller region, or refresh to retry.';
      attribution.replaceChildren(sourceLink('Protected Planet',PROTECTED_AREAS_SOURCE_URL),document.createTextNode(' / UNEP-WCMC and IUCN. Live citation unavailable; no replacement boundaries have been generated.'));
    } finally {if(alive&&ticket===generation)results.setAttribute('aria-busy','false');}
  }
  viewport.addEventListener('keydown',event=>{
    const moves={ArrowLeft:{longitude:view.longitude-rotationStep()},ArrowRight:{longitude:view.longitude+rotationStep()},ArrowUp:{latitude:view.latitude+rotationStep()},ArrowDown:{latitude:view.latitude-rotationStep()},'+':{zoom:view.zoom+.5},'=':{zoom:view.zoom+.5},'-':{zoom:view.zoom-.5}};
    if(moves[event.key]){event.preventDefault();move(moves[event.key]);}
  },eventOptions);
  function renderingError(){if(alive)rendererStatus.textContent='3D globe unavailable. You can still choose regions and explore the area list below.';}
  updateRenderer();clearDetails();
  const rendererReady=Promise.resolve().then(async()=>{
    const create=createRenderer??(await import('./globe-renderer.js')).createGlobeRenderer;
    const result=await create({container:viewport,onViewChange:next=>move(next),onSelect:selectFeature,onError:renderingError,onReady:()=>{if(alive)rendererStatus.textContent='';}});
    if(!alive){result.destroy();return;}renderer=result;rendererStatus.textContent='';updateRenderer();
  }).catch(renderingError);
  const ready=Promise.allSettled([rendererReady,loadAreas()]);
  return {ready,destroy(){if(!alive)return;alive=false;invalidate();events.abort();renderer?.destroy();root.remove();}};
}
