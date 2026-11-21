import {Deck, MapView, WebMercatorViewport} from '@deck.gl/core';
import {GoogleMapsOverlay} from '@deck.gl/google-maps';
import {chooseArea} from './map-state.js';
import {SPI_BANDS, classifySPI} from './spi.js';
import {createMapLayers} from './spi-layers.js';
import {normalizeBounds, sourceUrls, requestViewportData} from './viewport.js';
import {searchTaxa} from './species.js';
import {queryProtectedAreas} from './protected-areas.js';
import './style.css';

const $ = id => document.getElementById(id);
const state = {areas: [], area: null, tiles: {type: 'FeatureCollection', features: []},
  protected: {type: 'FeatureCollection', features: []}, gradient:{frames:[]}, species: [], view: null};
let googleMap, overlay, preview, viewportTimer, tilesRequest, protectedRequest, searchRequest, gradientRequest, estimateRequest;
let mapLabel = 'Coordinate preview';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function sourceLink(label, url) {
  const link = element('a', label); link.href = url;
  link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}

function renderLegend() {
  for (const band of SPI_BANDS) {
    const row = element('div', undefined, 'spi-band');
    const swatch = element('i'); swatch.style.background = `rgb(${band.color})`;
    row.append(swatch, element('span', band.name), element('span', band.range));
    $('spi-bands').append(row);
  }
}

function layers() {
  return createMapLayers({tiles: state.tiles, protectedAreas: state.protected,
    spiVisible: $('heatmap-toggle').checked, protectedVisible: $('protected-toggle').checked,
    onTileClick: showTile, onProtectedClick: showProtected,gradient:state.gradient,
    viewStyle:$('map-style').value,onGradientClick:showGradientEstimate});
}

function refreshLayers() {
  const next = layers(); overlay?.setProps({layers: next}); preview?.setProps({layers: next});
}

function showTile(feature) {
  const p = feature.properties, box = $('tile-info'); box.replaceChildren(); box.hidden = false;
  const classification = classifySPI(p.densityPiecesKm2);
  box.append(element('h2', `${classification?.name ?? 'Unclassified'} SPI`));
  box.append(element('p', `${Number(p.densityPiecesKm2).toLocaleString(undefined, {maximumFractionDigits: 1})} pieces/km²`, 'density-value'));
  const kindLabels = {measured: 'Measured observations', model: 'Model-based tile estimate', simulated: 'Simulated demonstration'};
  box.append(element('p', kindLabels[p.kind] ?? 'Sample-based estimate'));
  box.append(element('p', `Source records: ${p.sourceKind ?? 'See source'} • ${p.materialScope ?? 'See source particle-size definition'}`));
  box.append(element('p', `Water area: ${Number(p.waterAreaKm2).toFixed(3)} km². Modeled support: ${Number(p.dataWaterAreaKm2).toFixed(3)} km² (${(Number(p.coverageFraction) * 100).toFixed(1)}%).`));
  const dates = p.observationDates ?? [];
  box.append(element('p', `Observation dates: ${dates.length ? dates.join(', ') : 'Not supplied'}`));
  box.append(element('p', p.uncertainty == null ? 'Uncertainty: not supplied by the source.' : `Uncertainty: ${p.uncertainty}`));
  const center = p.center ?? state.area?.center;
  if (center) box.append(element('p', `Tile location: ${center[1].toFixed(4)}°, ${center[0].toFixed(4)}°`));
  box.append(element('p', `Tile: ${p.id ?? feature.id ?? 'See grid metadata'}`));
  const urls = sourceUrls(p.sourceUrl);
  for (const [index, url] of urls.entries()) {
    const row = element('p'); row.append(sourceLink(urls.length > 1 ? `Scientific source ${index + 1}` : 'View scientific source', url)); box.append(row);
  }
  box.append(element('p', 'Estimates describe sampled particle sizes, not every piece of marine litter.', 'species-note'));
  box.append(element('p', 'One-kilometer support cells approximate local conditions; they are not the sampled tow area.', 'species-note'));
  const close = element('button', 'Close details', 'text-button'); close.onclick = () => { box.hidden = true; }; box.append(close);
}

function showProtected(feature) {
  const p = feature.properties, box = $('tile-info'); box.replaceChildren(); box.hidden = false;
  box.append(element('h2', p.name ?? 'Protected area'));
  box.append(element('p', `${p.designation ?? ''} ${p.status ?? ''}`.trim()));
  box.append(element('p', 'Boundary source: Protected Planet / UNEP-WCMC and IUCN. Protection does not imply pollution-free water.'));
  if (p.sourceUrl) box.append(sourceLink('View Protected Planet record', p.sourceUrl));
  const close = element('button', 'Close details', 'text-button'); close.onclick = () => { box.hidden = true; }; box.append(close);
}

function viewBounds(view) {
  if (googleMap?.getBounds()) {
    const b = googleMap.getBounds(); return normalizeBounds([b.getSouthWest().lng(), b.getSouthWest().lat(), b.getNorthEast().lng(), b.getNorthEast().lat()]);
  }
  return normalizeBounds(new WebMercatorViewport({...view, width: $('map').clientWidth, height: $('map').clientHeight}).getBounds());
}

async function requestTiles(bounds, zoom) {
  tilesRequest?.abort();
  const controller = new AbortController(); tilesRequest = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
  const params = new URLSearchParams(Object.fromEntries(['west', 'south', 'east', 'north'].map((k, i) => [k, bounds[i]])));
  params.set('zoom', zoom);
  try {
    const response = await fetch(`/api/tiles?${params}`, {signal: controller.signal});
    if (!response.ok) throw new Error('Tile API unavailable');
    const data = await response.json();
    if (controller.signal.aborted || tilesRequest !== controller) return;
    state.tiles = data;
    $('detection-count').textContent = state.tiles.features.length.toLocaleString();
    if($('map-style').value==='tiles') $('map-empty').hidden = state.tiles.features.length > 0;
    const meta = state.tiles.metadata ?? state.tiles;
    const resolution = meta.resolutionKm2 ?? (zoom >= 13 ? 1 : zoom >= 11 ? 4 : zoom >= 8 ? 25 : 100);
    $('resolution').textContent = `${resolution} km² grid • only supported water is colored`;
    $('map-status').textContent = $('map-style').value==='gradient' ? `${mapLabel} · smoothed visual estimate` : `${mapLabel} · ${resolution} km² grid${meta.truncated || meta.limited ? ' · zoom in for more detail' : ''}`;
    refreshLayers();
  } catch (error) {
    if (tilesRequest !== controller || (error.name === 'AbortError' && !timedOut)) return;
    state.tiles = {type: 'FeatureCollection', features: []}; refreshLayers();
    $('detection-count').textContent = '0';
    $('map-status').textContent = 'Observation service unavailable. Start the local map server and refresh.';
  } finally { clearTimeout(timeout); }
}

async function requestGradient(bounds,zoom) {
  gradientRequest?.abort();const controller=new AbortController();gradientRequest=controller;
  const params=new URLSearchParams(Object.fromEntries(['west','south','east','north'].map((key,i)=>[key,bounds[i]])));params.set('zoom',zoom);
  $('gradient-status').textContent='Blending source observations and masking land…';
  try {
    const response=await fetch(`/api/gradient?${params}`,{signal:controller.signal});
    if(!response.ok)throw new Error('Gradient unavailable');
    const gradient=await response.json();if(controller.signal.aborted||gradientRequest!==controller)return;
    state.gradient=gradient;refreshLayers();
    if($('map-style').value==='gradient')$('map-empty').hidden=gradient.frames.some(frame=>frame.supportedPixels>0);
    $('gradient-status').textContent='Smooth estimate between observations, limited to 75 km from a source sample. Transparent areas lack support. This is not measured coverage; use survey tiles to check the original support.';
  } catch(error) {
    if(error.name==='AbortError'||gradientRequest!==controller)return;
    $('gradient-status').textContent='Smooth layer unavailable. Check the local map service, or switch to source-supported survey tiles.';
  }
}

async function showGradientEstimate(coordinates) {
  estimateRequest?.abort();const controller=new AbortController();estimateRequest=controller;
  try {
    const response=await fetch(`/api/estimate?${new URLSearchParams({longitude:coordinates[0],latitude:coordinates[1]})}`,{signal:controller.signal});
    if(!response.ok)throw new Error('Estimate unavailable');
    const data=await response.json();if(controller.signal.aborted||estimateRequest!==controller)return;
    const box=$('tile-info');box.replaceChildren();box.hidden=false;
    if(!data.estimate){box.append(element('h2','No supported estimate'),element('p','This point is on land or outside the model’s source-support range.'));}
    else {
      const p=data.estimate;
      box.append(element('h2',`${classifySPI(p.densityPiecesKm2)?.name??'Unclassified'} SPI`),
        element('p',`${p.densityPiecesKm2.toLocaleString(undefined,{maximumFractionDigits:1})} pieces/km²`,'density-value'),
        element('p','Smoothed visual estimate — not a measured sample or validated prediction.'),
        element('p',`Location: ${p.center[1].toFixed(4)}°, ${p.center[0].toFixed(4)}°. Nearest sample: ${p.nearestSampleKm.toFixed(1)} km.`),
        element('p',`${p.sampleCount} source samples within ${p.radiusKm} km. Dates: ${p.observationDates.join(', ')}.`),
        element('p',`Particle scope: ${p.materialScope.join('; ')}. Source kinds: ${p.sourceKind.join(', ')}.`),
        element('p','No validated uncertainty interval. The fade shows distance support, not lower particle density.'));
      const sources=element('details'),summary=element('summary','Scientific sources');sources.append(summary);
      for(const [index,url]of p.sourceUrls.entries()){const row=element('p');row.append(sourceLink(`Source sample ${index+1}`,url));sources.append(row);}box.append(sources);
    }
    const close=element('button','Close details','text-button');close.onclick=()=>{box.hidden=true;};box.append(close);
  }catch(error){if(error.name!=='AbortError')$('gradient-status').textContent='This estimate could not load. Try another point.';}
}

async function requestProtected(bounds = viewBounds(state.view)) {
  protectedRequest?.abort();
  const controller = new AbortController(); protectedRequest = controller;
  $('protected-status').textContent = 'Loading Protected Planet boundaries…';
  try {
    const data = await queryProtectedAreas(bounds, {signal: controller.signal});
    if (!$('protected-toggle').checked || controller.signal.aborted || protectedRequest !== controller) return;
    state.protected = data;
    $('protected-status').replaceChildren(element('span', `${data.features.length} protected boundaries${data.truncated || data.metadata?.truncated ? ' (partial; zoom in)' : ''}. ${data.attribution ?? 'UNEP-WCMC / IUCN'}. ${data.version ?? 'See source for release'}. `), sourceLink('Protected Planet', data.sourceUrl ?? 'https://www.protectedplanet.net/en'));
    refreshLayers();
  } catch (error) {
    if (error.name === 'AbortError' || protectedRequest !== controller) return;
    $('protected-status').textContent = 'Protected-area data unavailable. Check the source connection or zoom in.';
  }
}

function scheduleViewport(view) {
  state.view = view ?? state.view;
  tilesRequest?.abort(); protectedRequest?.abort(); gradientRequest?.abort();
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(() => {
    if (!state.view && !googleMap) return;
    const bounds = viewBounds(state.view), zoom = googleMap?.getZoom() ?? state.view.zoom;
    requestViewportData(bounds, zoom, {requestTiles, requestProtected, protectedEnabled: $('protected-toggle').checked, requestGradient,gradientEnabled:$('map-style').value==='gradient'});
  }, 180);
}

function showSpecies() {
  const list = $('species-list'); list.replaceChildren();
  // Area identifiers remain explicit curated broad-range matches, not point sightings.
  const tile = state.area?.studyTile ?? state.area?.id;
  let matches = state.species.filter(s => s.studyTiles.includes(tile));
  if (!matches.length) {
    list.append(element('p', 'Reference species below. Range overlap with this tile has not been established.', 'species-note'));
    matches = state.species;
  }
  for (const species of matches) {
    const card = element('article'), title = element('h3');
    title.append(sourceLink(species.name, species.sourceUrl));
    card.append(title, element('p', species.scientificName, 'scientific-name'), element('p', species.rangeSummary), element('p', species.habitat));
    if (species.wormsUrl) card.append(sourceLink(`WoRMS AphiaID ${species.aphiaId}`, species.wormsUrl));
    card.append(element('small', `NOAA range summary • reviewed ${species.reviewed}`)); list.append(card);
  }
}

function selectArea(area) {
  if (!area) return;
  state.area = area; $('area-name').textContent = area.name;
  const [lng, lat] = area.center;
  $('area-coordinates').textContent = `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`;
  $('area-select').value = area.id;
  const dates = area.dates ?? [];
  $('observation-dates').textContent = dates.length ? `Source dates: ${dates[0]}${dates.length > 1 ? ` to ${dates.at(-1)}` : ''}` : 'Inspect tiles for observation dates.';
  $('tile-info').hidden = true;
  const bounds = area.bounds ?? [lng - 0.04, lat - 0.04, lng + 0.04, lat + 0.04];
  if (googleMap) googleMap.fitBounds({west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3]}, 80);
  if (preview) {
    const view = new WebMercatorViewport({width: $('map').clientWidth, height: $('map').clientHeight})
      .fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {padding: 90, maxZoom: 13});
    state.view = {longitude: view.longitude, latitude: view.latitude, zoom: view.zoom};
    preview.setProps({initialViewState: state.view}); scheduleViewport(state.view);
  }
  showSpecies();
}

function createPreview(message = 'Coordinate preview') {
  overlay?.finalize(); overlay = null; googleMap = null; mapLabel = message;
  if (preview) return;
  $('map').replaceChildren(); $('key-notice').hidden = false; $('map-status').textContent = mapLabel;
  const canvas = element('canvas'); $('map').append(canvas);
  state.view = {longitude: -30, latitude: 25, zoom: 2};
  try {
    preview = new Deck({canvas, width: '100%', height: '100%', controller: true, views: new MapView({repeat: true}),
      initialViewState: state.view, layers: layers(),
      onViewStateChange: ({viewState}) => scheduleViewport(viewState),
      onError: () => { $('map-status').textContent = 'Rendering unavailable. Enable WebGL2 or try another browser.'; },
    });
  } catch { $('map-status').textContent = 'Rendering unavailable. Enable WebGL2 or try another browser.'; }
}

async function loadGoogleMaps(key) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Map load timed out')), 15000);
    window.marineGuarderMapReady = () => { clearTimeout(timeout); resolve(); };
    const script = element('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({key, callback: 'marineGuarderMapReady', loading: 'async', v: 'quarterly'})}`;
    script.async = true;
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Map load failed')); };
    document.head.append(script);
  });
}

async function loadAreas() {
  const response = await fetch('/api/areas');
  if (!response.ok) throw new Error('Areas API unavailable');
  const data = await response.json(); state.areas = data.areas;
  $('data-source').textContent = typeof data.source === 'string' ? data.source : (data.source?.name ?? 'Scientific observations. See individual tile sources.');
  $('area-select').replaceChildren();
  for (const area of state.areas) $('area-select').append(new Option(area.name, area.id));
  $('area-select').disabled = !state.areas.length; $('random-area').disabled = !state.areas.length;
  if (!state.areas.length) {
    $('area-name').textContent = 'No compatible observations';
    $('area-select').append(new Option('No study areas available', ''));
  }
  return chooseArea(state.areas);
}

async function start() {
  renderLegend();
  try { const r = await fetch('/species.json'); if (r.ok) state.species = (await r.json()).species; } catch { /* Search remains available. */ }
  try { state.area = await loadAreas(); } catch {
    $('area-name').textContent = 'Start the observation service';
    $('data-source').textContent = 'Run the local map server, then refresh observations. No estimates are invented when a source is unavailable.';
  }
  window.gm_authFailure = () => { createPreview('Google Maps authorization failed'); if (state.area) selectArea(state.area); };
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (key) {
    try {
      await loadGoogleMaps(key);
      googleMap = new google.maps.Map($('map'), {center: {lat: 25, lng: -30}, zoom: 2,
        mapTypeId: 'hybrid', streetViewControl: false, mapTypeControl: true, fullscreenControl: true});
      overlay = new GoogleMapsOverlay({interleaved: false, layers: layers()}); overlay.setMap(googleMap);
      mapLabel = 'Google Maps'; googleMap.addListener('idle', () => scheduleViewport());
    } catch { createPreview('Google Maps unavailable · coordinate preview'); }
  } else createPreview();
  if (state.area) selectArea(state.area); else { showSpecies(); scheduleViewport(state.view); }
}

$('random-area').onclick = () => selectArea(chooseArea(state.areas, state.area?.id));
$('area-select').onchange = event => selectArea(state.areas.find(area => area.id === event.target.value));
$('heatmap-toggle').onchange = () => { refreshLayers(); $('tile-info').hidden = true; };
$('map-style').onchange=()=>{gradientRequest?.abort();$('tile-info').hidden=true;refreshLayers();scheduleViewport(state.view);};
$('protected-toggle').onchange = () => {
  protectedRequest?.abort(); refreshLayers();
  if ($('protected-toggle').checked) requestProtected(); else $('protected-status').textContent = '';
};
$('refresh-data').onclick = async () => {
  try { const area = await loadAreas(); selectArea(area); } catch { $('map-status').textContent = 'Observation service unavailable. Start map_server.py and try again.'; }
};
$('species-search').onsubmit = async event => {
  event.preventDefault(); searchRequest?.abort(); searchRequest = new AbortController();
  $('search-status').textContent = 'Searching WoRMS…'; $('taxon-results').replaceChildren();
  try {
    const records = await searchTaxa($('species-query').value, {signal: searchRequest.signal});
    $('search-status').textContent = records.length ? `${records.length} WoRMS matches` : 'No matching record. Try a scientific name or an exact common name.';
    for (const record of records) {
      const article = element('article'), title = element('h3');
      title.append(sourceLink(record.acceptedScientificName ?? record.originalName, record.url));
      article.append(title, element('p', `${record.authority ?? ''} • AphiaID ${record.aphiaId}`));
      article.append(element('p', `Searched name: ${record.originalName} (${record.status})`));
      article.append(element('p', Object.values(record.classification ?? {}).filter(Boolean).join(' / ')));
      $('taxon-results').append(article);
    }
  } catch (error) { if (error.name !== 'AbortError') $('search-status').textContent = 'WoRMS could not be reached. Check your connection and try again.'; }
};
start().catch(() => { $('map-status').textContent = 'Explorer could not start. Refresh to try again.'; });
