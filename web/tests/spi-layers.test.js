import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapLayers} from '../src/spi-layers.js';

test('SPI toggle hides only pollution, without mutating water polygons or hiding protections', () => {
  const water = {type: 'FeatureCollection', features: []};
  const protectedAreas = {type: 'FeatureCollection', features: []};
  const off = createMapLayers({tiles: water, protectedAreas, spiVisible: false, protectedVisible: true});
  const find = (layers, id) => layers.find(layer => layer.id === id);
  assert.equal(find(off, 'spi-water-tiles').props.visible, false);
  assert.equal(find(off, 'spi-water-tiles').props.data, water);
  assert.equal(find(off, 'spi-unknown-water').props.visible, false);
  assert.equal(find(off, 'protected-boundaries').props.visible, true);
  const on = createMapLayers({tiles: water, protectedAreas, spiVisible: true, protectedVisible: false});
  assert.equal(find(on, 'spi-water-tiles').props.visible, true);
  assert.equal(find(on, 'protected-boundaries').props.visible, false);
  assert.equal(find(on, 'spi-unknown-water').props.visible, true);
  assert.deepEqual(find(on, 'spi-water-tiles').props.getFillColor({properties: {densityPiecesKm2: 600}}), [210, 47, 47, 190]);
});

test('gradient view uses a smooth bitmap instead of the sparse tile fill', () => {
  const water={type:'FeatureCollection',features:[]};
  const layers=createMapLayers({tiles:water,protectedAreas:water,spiVisible:true,protectedVisible:false,
    viewStyle:'gradient',gradient:{frames:[{bounds:[0,0,1,1],image:'data:image/png;base64,abc'}]}});
  assert.equal(layers.find(layer=>layer.id==='spi-water-tiles').props.visible,false);
  const bitmap=layers.find(layer=>layer.id==='spi-gradient-0');
  assert.ok(bitmap);
  assert.ok(layers.findIndex(layer=>layer.id==='spi-unknown-water') < layers.indexOf(bitmap));
  assert.equal(bitmap.props.visible,true);
  assert.equal(bitmap.props._imageCoordinateSystem,'lnglat');
});
