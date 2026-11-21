import {BitmapLayer,GeoJsonLayer,TextLayer} from '@deck.gl/layers';

export function createGlobeLayers({features=[],selectedId=null,protectedVisible=true,onSelect,onImageError,places=[],view={zoom:0}}={}) {
  return [
    new BitmapLayer({id:'earth-imagery',image:'/globe/earth-natural.jpg',bounds:[-180,-90,180,90],
      _imageCoordinateSystem:'lnglat',pickable:false,onError:onImageError}),
    new GeoJsonLayer({id:'globe-protected',data:{type:'FeatureCollection',features},
      visible:protectedVisible,pickable:true,filled:true,stroked:true,wrapLongitude:true,
      getFillColor:feature=>feature.id===selectedId?[255,174,112,155]:[36,218,184,100],
      getLineColor:feature=>feature.id===selectedId?[255,209,153,255]:[111,255,218,240],
      lineWidthMinPixels:1.5,getLineWidth:1,autoHighlight:true,highlightColor:[255,238,169,160],
      updateTriggers:{getFillColor:[selectedId],getLineColor:[selectedId]},
      onClick:info=>{if(info.object)onSelect?.(info.object);},
    }),
    new TextLayer({id:'globe-place-names',data:places.filter(place=>place.kind==='water'||place.rank<=(view.zoom>=2?6:2)),
      getPosition:place=>place.position,getText:place=>place.name,getSize:place=>place.kind==='water'?15:13,
      getColor:place=>place.kind==='water'?[24,68,89,235]:[28,53,48,240],
      fontFamily:'Manrope, sans-serif',fontWeight:600,fontSettings:{sdf:true},outlineWidth:.15,outlineColor:[246,251,248,230],
      getTextAnchor:'middle',getAlignmentBaseline:'center',billboard:true,pickable:false}),
  ];
}
