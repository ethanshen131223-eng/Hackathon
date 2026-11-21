import {BitmapLayer,TextLayer} from '@deck.gl/layers';

export function createBasemapLayers({places=[],zoom=2}={}) {
  return [new BitmapLayer({id:'natural-earth-background',image:'/globe/earth-map.jpg',bounds:[-180,-85.0511,180,85.0511],
    _imageCoordinateSystem:'lnglat',tintColor:[255,255,255],pickable:false}),
    new TextLayer({id:'natural-earth-place-names',data:places.filter(place=>place.kind==='water'||place.rank<=(zoom>=4?6:3)),
      getPosition:place=>place.position.slice(0,2),getText:place=>place.name,getSize:place=>place.kind==='water'?16:14,
      getColor:place=>place.kind==='water'?[29,77,98,245]:[31,61,57,245],fontFamily:'Manrope, sans-serif',fontWeight:600,
      fontSettings:{sdf:true},outlineWidth:.18,outlineColor:[248,252,246,240],getTextAnchor:'middle',getAlignmentBaseline:'center',pickable:false})];
}
