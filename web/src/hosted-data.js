const downloads=new Map();
export async function hostedDocument(name,signal) {
  if(!downloads.has(name))downloads.set(name,fetch(`/hosted/${name}.json`).then(response=>{
    if(!response.ok)throw new Error('Hosted source snapshot unavailable');return response.json();
  }).catch(error=>{downloads.delete(name);throw error;}));
  const document=await downloads.get(name);signal?.throwIfAborted();return document;
}

export function chooseHostedCase(document,{difficulty='beginner',exclude=[],day,rng=Math.random}={}) {
  const [low,high]={beginner:[1,3],explorer:[4,6],challenge:[7,12]}[difficulty]??[1,12];
  let pool=document.cases.filter(item=>item.targets.length>=low&&item.targets.length<=high);
  const fallback=!pool.length;if(fallback)pool=document.cases;
  if(!pool.length)throw new Error('No bundled field photos');
  const candidates=day?pool:pool.filter(item=>!exclude.includes(item.id));
  const available=candidates.length?candidates:pool;
  let index;
  if(day){
    const parsed=Date.parse(`${day}T00:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==day)throw new Error('Invalid daily date');
    index=[...day].reduce((sum,character)=>(sum*31+character.charCodeAt(0))>>>0,0)%available.length;
  }else index=Math.min(available.length-1,Math.max(0,Math.floor(rng()*available.length)));
  const item=structuredClone(available[index]);
  item.source={...item.source,poolSize:document.cases.length,drawPoolSize:pool.length,hostedSnapshot:true,exportedAt:document.exportedAt};
  item.intro=`${fallback?'This hosted photo collection has no cases at the requested difficulty; another available photo is shown. ':''}${item.intro}`;
  return item;
}

const spans=bounds=>bounds[0]>bounds[2]?[[bounds[0],180],[-180,bounds[2]]]:[[bounds[0],bounds[2]]];
function intersects(a,b){return a[1]<=b[3]&&a[3]>=b[1]&&spans(a).some(x=>spans(b).some(y=>x[0]<=y[1]&&x[1]>=y[0]));}
export function selectHostedPollution(document,bounds,zoom=6) {
  const snapshots=document.snapshots.filter(snapshot=>intersects(snapshot.bounds,bounds)),unique=new Map();
  for(const snapshot of snapshots)for(const feature of snapshot.tiles.features)unique.set(feature.id??feature.properties.id,feature);
  const resolution=document.resolutionKm2??snapshots[0]?.tiles.metadata?.resolutionKm2??1;
  const field=zoom<4&&document.overviewGradient?document.overviewGradient:snapshots[0]?.gradient??document.overviewGradient??{};
  return {tiles:{type:'FeatureCollection',features:[...unique.values()],metadata:{resolutionKm2:resolution,precomputedSnapshot:true,exportedAt:document.exportedAt}},
    gradient:{...field,frames:zoom<4&&document.overviewGradient?document.overviewGradient.frames:snapshots.flatMap(snapshot=>snapshot.gradient.frames),precomputedSnapshot:true,exportedAt:document.exportedAt}};
}
function inRing([x,y],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export function tileAtPoint(tiles,point) {
  return tiles.features.find(feature=>{
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
    return polygons.some(rings=>inRing(point,rings[0])&&!rings.slice(1).some(ring=>inRing(point,ring)));
  })??null;
}
