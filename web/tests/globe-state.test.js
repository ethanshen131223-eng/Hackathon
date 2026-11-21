import test from 'node:test';
import assert from 'node:assert/strict';
import * as globe from '../src/globe-state.js';
import {createGlobeLayers} from '../src/globe-layers.js';

test('globe query bounds remain regional and valid across the date line and poles',()=>{
  assert.deepEqual(globe.globeQueryBounds({longitude:0,latitude:0,zoom:0}),[-32,-32,32,32]);
  const crossing=globe.globeQueryBounds({longitude:179,latitude:10,zoom:2});
  assert.ok(crossing[0]>crossing[2]);
  for(const latitude of [-90,-85,85,90]){
    const [w,s,e,n]=globe.globeQueryBounds({longitude:180,latitude,zoom:0});
    assert.ok(w>=-180&&e<=180&&s>=-90&&n<=90&&s<n&&w!==e);
  }
  const near=globe.globeQueryBounds({longitude:0,latitude:0,zoom:5});
  assert.ok(near[2]-near[0]<10);
});

test('camera and region helpers bound zoom and use geographic shortcuts without invented sites',()=>{
  assert.equal(globe.normalizeGlobeView({longitude:541,latitude:100,zoom:20}).longitude,-179);
  assert.equal(globe.normalizeGlobeView({longitude:541,latitude:100,zoom:20}).latitude,85);
  assert.equal(globe.normalizeGlobeView({longitude:0,latitude:0,zoom:-9}).zoom,0);
  assert.ok(globe.GLOBE_REGIONS.length>=6);
  assert.ok(globe.GLOBE_REGIONS.every(r=>r.id&&r.name&&Number.isFinite(r.longitude)&&!r.geometry));
});

test('feature focus handles date-line polygons and filtering only searches loaded names',()=>{
  const a={type:'Feature',id:'a',properties:{name:'Pacific sanctuary',designation:'Marine reserve'},geometry:{type:'Polygon',coordinates:[[[179,10],[-179,10],[-179,12],[179,12],[179,10]]]}};
  const focus=globe.featureFocus(a);
  assert.ok(Math.abs(focus.longitude)>178);assert.equal(focus.latitude,11);
  assert.deepEqual(globe.filterGlobeFeatures([a],'PACIFIC'),[a]);
  assert.deepEqual(globe.filterGlobeFeatures([a],'unknown'),[]);
});

test('globe layers draw natural Earth imagery and actual selectable polygons; toggle preserves Earth',()=>{
  const feature={id:'area-1',type:'Feature',properties:{name:'Area'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}};
  let clicked;
  const layers=createGlobeLayers({features:[feature],selectedId:'area-1',protectedVisible:true,onSelect:f=>clicked=f});
  assert.equal(layers[0].id,'earth-imagery');
  assert.equal(layers[0].constructor.layerName,'BitmapLayer');
  assert.deepEqual(layers[0].props.bounds,[-180,-90,180,90]);
  assert.equal(layers[0].props._imageCoordinateSystem,'lnglat');
  const areas=layers.find(l=>l.id==='globe-protected');assert.ok(areas.props.pickable);
  assert.equal(areas.props.data.features[0],feature);
  areas.props.onClick({object:feature});assert.equal(clicked,feature);
  assert.deepEqual(areas.props.getFillColor(feature),[255,174,112,155]);
  assert.equal(createGlobeLayers({features:[feature],protectedVisible:false}).find(l=>l.id==='globe-protected').props.visible,false);
});
