export const GLOBE_REGIONS = Object.freeze([
  {id:'galapagos',name:'Galápagos waters',longitude:-90,latitude:-2,zoom:.65},
  {id:'coral-sea',name:'Coral Sea',longitude:150,latitude:-20,zoom:.65},
  {id:'hawaii',name:'Hawaiian islands',longitude:-165,latitude:25,zoom:.65},
  {id:'caribbean',name:'Caribbean Sea',longitude:-75,latitude:18,zoom:.65},
  {id:'azores',name:'Azores & North Atlantic',longitude:-28,latitude:38,zoom:.65},
  {id:'palau',name:'Palau & western Pacific',longitude:135,latitude:7,zoom:.65},
  {id:'cape',name:'Southern African waters',longitude:22,latitude:-34,zoom:.65},
  {id:'southern',name:'Southern Ocean',longitude:165,latitude:-67,zoom:.65},
]);

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export const wrapLongitude=value=>((value+180)%360+360)%360-180;
export function normalizeGlobeView(view) {
  return {longitude:wrapLongitude(Number.isFinite(view.longitude)?view.longitude:0),
    latitude:clamp(Number.isFinite(view.latitude)?view.latitude:0,-85,85),
    zoom:clamp(Number.isFinite(view.zoom)?view.zoom:0,0,6),bearing:0,pitch:0,minZoom:0,maxZoom:6};
}

/** Regional query near the globe center, not a claim of hemisphere-wide coverage. */
export function globeQueryBounds(view) {
  const {longitude,latitude,zoom}=normalizeGlobeView(view);
  const latSpan=clamp(32/2**Math.max(0,zoom-1),.8,32);
  const lonSpan=Math.min(175,latSpan/Math.max(.2,Math.cos(latitude*Math.PI/180)));
  return [wrapLongitude(longitude-lonSpan),Math.max(-90,latitude-latSpan),
    wrapLongitude(longitude+lonSpan),Math.min(90,latitude+latSpan)].map(value=>Math.round(value*1e5)/1e5);
}

export function filterGlobeFeatures(features,query='') {
  const term=query.trim().toLocaleLowerCase();
  return features.filter(feature=>`${feature.properties.name} ${feature.properties.designation??''}`.toLocaleLowerCase().includes(term));
}

/** Smallest longitude arc, so date-line parcels focus in the Pacific rather than Greenwich. */
export function featureFocus(feature) {
  const coordinates=[];
  const collect=value=>{
    if(Array.isArray(value)&&value.length>=2&&typeof value[0]==='number') {
      if(Number.isFinite(value[0])&&Number.isFinite(value[1]))coordinates.push(value);
    } else if(Array.isArray(value))value.forEach(collect);
  };
  collect(feature.geometry?.coordinates);
  if(!coordinates.length)return null;
  const longs=coordinates.map(p=>(p[0]%360+360)%360).sort((a,b)=>a-b);
  let gap=-1,gapIndex=0;
  for(let i=0;i<longs.length;i++) {
    const difference=(i===longs.length-1?longs[0]+360:longs[i+1])-longs[i];
    if(difference>gap){gap=difference;gapIndex=i;}
  }
  const start=longs[(gapIndex+1)%longs.length],width=360-gap;
  const lats=coordinates.map(p=>p[1]),south=Math.min(...lats),north=Math.max(...lats);
  return normalizeGlobeView({longitude:start+width/2,latitude:(south+north)/2,
    zoom:clamp(Math.log2(90/Math.max(width,north-south,.5)),1.2,5)});
}

export function coordinateLabel(view) {
  return `${Math.abs(view.latitude).toFixed(1)}°${view.latitude<0?'S':'N'}, ${Math.abs(view.longitude).toFixed(1)}°${view.longitude<0?'W':'E'}`;
}
