import {GeoJsonLayer, BitmapLayer} from '@deck.gl/layers';
import {classifySPI} from './spi.js';

export function createMapLayers({tiles, protectedAreas, spiVisible, protectedVisible, onTileClick, onProtectedClick, viewStyle='tiles', gradient, onGradientClick}) {
  const bitmaps=(gradient?.frames??[]).map((frame,index)=>new BitmapLayer({
    id:`spi-gradient-${index}`,image:frame.image,bounds:frame.bounds,
    visible:spiVisible&&viewStyle!=='tiles',pickable:true,_imageCoordinateSystem:'lnglat',
    onClick:info=>{if(info.coordinate)onGradientClick?.(info.coordinate);},
  }));
  return [new BitmapLayer({
    id:'spi-unknown-water', image:'/hosted/ocean-no-data.png', bounds:[-180,-85,180,85],
    visible:spiVisible, pickable:false, _imageCoordinateSystem:'lnglat',
  }), ...bitmaps,new GeoJsonLayer({
    id: 'spi-water-tiles', data: tiles, visible: spiVisible&&viewStyle==='tiles',
    filled: true, stroked: true, pickable: true,
    getFillColor: feature => [...(classifySPI(feature.properties.densityPiecesKm2)?.color ?? [130, 145, 151]), 190],
    getLineColor: [255, 255, 255, 110], lineWidthMinPixels: 0.6,
    onClick: ({object}) => { if (object) onTileClick?.(object); },
  }), new GeoJsonLayer({
    id: 'protected-boundaries', data: protectedAreas, visible: protectedVisible,
    filled: false, stroked: true, pickable: true,
    getLineColor: [125, 73, 217, 255], lineWidthMinPixels: 2,
    onClick: ({object}) => { if (object) onProtectedClick?.(object); },
  })];
}
