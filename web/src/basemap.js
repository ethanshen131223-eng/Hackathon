import {BitmapLayer,TextLayer} from '@deck.gl/layers';

export function visibleMapLabels(places, zoom) {
  const scale = 512 * 2 ** zoom;
  const accepted = [];
  const candidates = places.filter(place => place.kind === 'water' || place.rank <= (zoom >= 4 ? 6 : 3))
    .sort((a, b) => a.rank - b.rank || Number(b.kind === 'water') - Number(a.kind === 'water'));
  for (const place of candidates) {
    const [longitude, latitude] = place.position;
    const radians = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
    const x = ((longitude + 180) / 360) * scale;
    const y = -scale * Math.asinh(Math.tan(radians)) / (2 * Math.PI);
    const width = place.name.length * (place.kind === 'water' ? 9 : 8) + 12;
    if (accepted.some(other => {
      const delta = Math.abs(x - other.x);
      return Math.min(delta, scale - delta) < (width + other.width) / 2 && Math.abs(y - other.y) < 21;
    })) continue;
    accepted.push({place, x, y, width});
  }
  return accepted.map(({place}) => place);
}

export function createBasemapLayers({places=[],zoom=2}={}) {
  return [new BitmapLayer({id:'natural-earth-background',image:'/globe/earth-map.jpg',bounds:[-180,-85.0511,180,85.0511],
    _imageCoordinateSystem:'lnglat',tintColor:[255,255,255],pickable:false}),
    new TextLayer({id:'natural-earth-place-names',data:visibleMapLabels(places,zoom),
      getPosition:place=>place.position.slice(0,2),getText:place=>place.name,getSize:place=>place.kind==='water'?16:14,
      getColor:place=>place.kind==='water'?[29,77,98,245]:[31,61,57,245],fontFamily:'Manrope, sans-serif',fontWeight:600,
      fontSettings:{sdf:true},outlineWidth:.18,outlineColor:[248,252,246,240],getTextAnchor:'middle',getAlignmentBaseline:'center',pickable:false})];
}
