import test from 'node:test';
import assert from 'node:assert/strict';
import {queryProtectedAreas} from '../src/protected-areas.js';

const polygon = {type: 'Polygon', coordinates: [[[-88, 15], [-87, 15], [-87, 16], [-88, 15]]]};
const marineArea = {type: 'Feature', geometry: polygon,
  properties: {objectid: 10, site_id: 12564, site_pid: '12564', name_eng: 'Punta de Manabique',
    name: 'Punta de Manabique', desig_eng: 'Wildlife Refuge', desig: 'Refugio de Vida Silvestre',
    status: 'Designated', site_type: 'PA', realm: 'Coastal'}};
const metadata = {copyrightText: 'UNEP-WCMC and IUCN (2026), Protected Planet: The World Database on Protected and Conserved Areas (WDPCA) [On-line], [October 2026], Cambridge, UK: UNEP-WCMC and IUCN. Available at: https://www.protectedplanet.net/.'};
const json = value => new Response(JSON.stringify(value), {status: 200});

test('viewport query returns normalized protected polygons with source provenance', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (!url.pathname.endsWith('/query')) return json(metadata);
    // Wrong coordinates, projection or server filter fails this observable query.
    assert.equal(url.searchParams.get('geometry'), '-88.3,15.4,-87.7,16.1');
    assert.equal(url.searchParams.get('inSR'), '4326');
    assert.equal(url.searchParams.get('outSR'), '4326');
    assert.equal(url.searchParams.get('resultRecordCount'), '200');
    assert.match(url.searchParams.get('where'), /site_type = 'PA'/);
    return json({type: 'FeatureCollection', features: [marineArea]});
  });
  const result = await queryProtectedAreas([-88.3, 15.4, -87.7, 16.1]);
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.id, '12564');
  assert.equal(result.features[0].properties.name, 'Punta de Manabique');
  assert.equal(result.features[0].properties.kind, 'Protected area');
  assert.equal(result.features[0].properties.designation, 'Wildlife Refuge');
  assert.equal(result.features[0].properties.status, 'Designated');
  assert.equal(result.features[0].properties.sourceUrl, 'https://www.protectedplanet.net/12564');
  assert.deepEqual(result.features[0].geometry, polygon);
  assert.equal(result.version, 'October 2026');
  assert.match(result.attribution, /UNEP-WCMC and IUCN/);
});

test('OECMs and non-polygon or terrestrial features never appear as protected marine areas', async t => {
  t.mock.method(globalThis, 'fetch', async input => new URL(input).pathname.endsWith('/query')
    ? json({type: 'FeatureCollection', features: [marineArea,
      {...marineArea, properties: {...marineArea.properties, site_type: 'OECM'}},
      {...marineArea, properties: {...marineArea.properties, realm: 'Terrestrial'}},
      {...marineArea, geometry: {type: 'Point', coordinates: [-88, 15]}}]}) : json(metadata));
  assert.equal((await queryProtectedAreas([-89, 14, -87, 17])).features.length, 1);
});

test('server truncation is preserved and output is bounded to 200', async t => {
  const features = Array.from({length: 205}, (_, i) => ({...marineArea,
    properties: {...marineArea.properties, site_pid: String(10000 + i)}}));
  t.mock.method(globalThis, 'fetch', async input => new URL(input).pathname.endsWith('/query')
    ? json({type: 'FeatureCollection', features, exceededTransferLimit: true}) : json(metadata));
  const result = await queryProtectedAreas([-89, 14, -87, 17]);
  assert.equal(result.features.length, 200);
  assert.equal(result.truncated, true);
});

test('a valid empty query is distinct from an ArcGIS service error', async t => {
  t.mock.method(globalThis, 'fetch', async input => new URL(input).pathname.endsWith('/query')
    ? json({type: 'FeatureCollection', features: []}) : json(metadata));
  assert.deepEqual((await queryProtectedAreas([-89, 14, -87, 17])).features, []);
  t.mock.method(globalThis, 'fetch', async () => json({error: {code: 400, message: 'Invalid query'}}));
  await assert.rejects(queryProtectedAreas([-89, 14, -87, 17]), error => error.code === 'SERVICE');
});

test('unavailable and malformed responses reject with explicit failure codes', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw new TypeError('Failed to fetch');});
  await assert.rejects(queryProtectedAreas([-89, 14, -87, 17]), error => error.code === 'NETWORK');
  t.mock.method(globalThis, 'fetch', async () => json({unexpected: true}));
  await assert.rejects(queryProtectedAreas([-89, 14, -87, 17]), error => error.code === 'INVALID_RESPONSE');
});

test('invalid coordinates fail before any request and cancellation stays AbortError', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw new Error('Unexpected request');});
  await assert.rejects(queryProtectedAreas([-190, 14, -87, 17]), error => error.code === 'INVALID_BOUNDS');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(queryProtectedAreas([-89, 14, -87, 17], {signal: controller.signal}), {name: 'AbortError'});
});

test('a viewport crossing the date line is split and duplicate parcels appear once', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (!url.pathname.endsWith('/query')) return json(metadata);
    assert.ok(['170,-10,180,10', '-180,-10,-170,10'].includes(url.searchParams.get('geometry')));
    return json({type: 'FeatureCollection', features: [marineArea]});
  });
  const result = await queryProtectedAreas([170, -10, -170, 10]);
  assert.equal(result.features.length, 1);
});

test('globe requests use bounded generalized display geometry without changing map defaults',async t=>{
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);if(!url.pathname.endsWith('/query'))return json(metadata);
    assert.equal(url.searchParams.get('resultRecordCount'),'80');
    assert.equal(url.searchParams.get('maxAllowableOffset'),'0.03');
    return json({type:'FeatureCollection',features:[marineArea],exceededTransferLimit:true});
  });
  const result=await queryProtectedAreas([-89,14,-87,17],{maxFeatures:80,generalizationDegrees:.03});
  assert.equal(result.maxFeatures,80);assert.equal(result.geometryGeneralizationDegrees,.03);assert.equal(result.truncated,true);
});

test('site details preserve official reported fields without substituting GIS measurements',async t=>{
  const details={...marineArea,properties:{...marineArea.properties,iucn_cat:'III',status_yr:2005,
    rep_area:1527.97454488,rep_m_area:294.76,gis_area:1700,gis_m_area:340,
    gov_type:'Non-profit organisations',mang_auth:'CONAP',no_take:'Part',no_tk_area:25,
    iso3:'GTM',prnt_iso3:'GTM'}};
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);if(!url.pathname.endsWith('/query'))return json(metadata);
    const fields=url.searchParams.get('outFields').split(',');
    for(const field of ['iucn_cat','status_yr','rep_area','rep_m_area','gov_type','mang_auth','no_take','no_tk_area','iso3','prnt_iso3'])assert.ok(fields.includes(field),`Request must include ${field}`);
    return json({type:'FeatureCollection',features:[details]});
  });
  const p=(await queryProtectedAreas([-89,14,-87,17])).features[0].properties;
  assert.equal(p.iucnCategory,'III');assert.equal(p.statusYear,2005);
  assert.equal(p.reportedAreaKm2,1527.97454488);assert.equal(p.reportedMarineAreaKm2,294.76);
  assert.equal(p.governance,'Non-profit organisations');assert.equal(p.managementAuthority,'CONAP');
  assert.equal(p.noTake,'Part');assert.equal(p.noTakeAreaKm2,25);
  assert.equal(p.countryCodes,'GTM');assert.equal(p.parentCountryCodes,'GTM');
});

test('missing or invalid source details stay unknown while a reported zero is retained',async t=>{
  const details={...marineArea,properties:{...marineArea.properties,iucn_cat:'Not Reported',status_yr:0,
    rep_area:null,rep_m_area:0,gov_type:'',mang_auth:null,no_take:'Not Reported',no_tk_area:-1,iso3:null}};
  t.mock.method(globalThis,'fetch',async input=>new URL(input).pathname.endsWith('/query')
    ?json({type:'FeatureCollection',features:[details]}):json(metadata));
  const p=(await queryProtectedAreas([-89,14,-87,17])).features[0].properties;
  assert.equal(p.statusYear,null);assert.equal(p.reportedAreaKm2,null);
  assert.equal(p.reportedMarineAreaKm2,0);assert.equal(p.noTakeAreaKm2,null);
  assert.equal(p.governance,null);assert.equal(p.managementAuthority,null);assert.equal(p.countryCodes,null);
  assert.equal(p.iucnCategory,'Not Reported');assert.equal(p.noTake,'Not Reported');
});
