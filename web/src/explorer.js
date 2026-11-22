import {Deck, MapView, WebMercatorViewport} from '@deck.gl/core';
import {GoogleMapsOverlay} from '@deck.gl/google-maps';
import {chooseArea} from './map-state.js';
import {SPI_BANDS, classifySPI} from './spi.js';
import {createMapLayers} from './spi-layers.js';
import {normalizeBounds, sourceUrls, requestViewportData} from './viewport.js';
import {searchTaxa} from './species.js';
import {queryProtectedAreas} from './protected-areas.js';
import {createProtectedAreaDetails, protectedAreaSummary} from './protected-area-details.js';
import {createBasemapLayers} from './basemap.js';
import {hostedDocument,selectHostedPollution,tileAtPoint} from './hosted-data.js';
import {mountExplorerSwitch} from './explorer-switch.js';
import {featureFocus} from './globe-state.js';
import './style.css';
import './globe.css';
import './bottom-bar.css';
import {mountCleanupPlanner} from './cleanup-planner.js';
import {mountCurrentTimeline} from './current-timeline.js';

const $ = id => document.getElementById(id);
const state = {areas: [], area: null, tiles: {type: 'FeatureCollection', features: []},
  protected: {type: 'FeatureCollection', features: []}, gradient:{frames:[]}, species: [], view: null};
let googleMap, overlay, preview, viewportTimer, tilesRequest, protectedRequest, searchRequest, gradientRequest, estimateRequest;
let mapLabel = 'Natural Earth map', placeLabels = [], hostedMode = false, oceanVisible=true, explorerShell;

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

let globalPlastic;
let currentScenario;
let scenarioPick = 0;
const globalSource = 'https://doi.org/10.6084/m9.figshare.1613256';
const currentSource = 'https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_monthlymeans/index.html';
const scenarioYear = () => Number($('scenario-year').value);

async function loadGlobalPlastic() {
  globalPlastic ??= await hostedDocument('global-plastic-2014');
  globalPlastic.mask ??= atob(globalPlastic.supportMask);
  return globalPlastic;
}

function renderLegend() {
  $('spi-bands').replaceChildren();
  const global = $('map-style').value === 'global';
  const years = $('map-style').value === 'years';
  const continuous = $('map-style').value !== 'tiles';
  const scale = years ? currentScenario?.colorScale : global ? globalPlastic?.colorScale : state.gradient.colorScale;
  $('legend-title').textContent=continuous?'Particle concentration':'Sea Pollution Index';
  $('legend-unit').textContent=continuous?'pieces / km² · square-root color scale':'Floating pieces / km²';
  $('density-scale-labels').hidden=!continuous;
  $('density-scale-labels').textContent=scale?`0   ·   ${Math.round(scale.maximum/4).toLocaleString()}   ·   ≥${Math.round(scale.maximum).toLocaleString()}`:'Loading concentration scale…';
  const colors = scale?.colors?.map(color => `rgb(${color.join(',')})`).join(',') ||
    '#193dd2,#00bdf1,#ffe72c,#ff7712,#cd002c';
  $('legend-gradient').style.background = continuous ? `linear-gradient(90deg,${colors})` : 'linear-gradient(90deg,#307ed8,#369d5b,#f0d135,#ef8523,#d22f2f)';
  $('legend-note').textContent=continuous?'Blue: lower concentration; red: higher. Colors saturate at the source’s 95th percentile. Exact SPI class is in tile details.':'Fixed SPI classification thresholds. Unobserved water remains unknown.';
  $('spi-bands').hidden=continuous;
  if (global) {
    $('legend-title').textContent = 'Global model (2014)';
    $('legend-note').textContent = 'Floating microplastic estimates from van Sebille et al. (2015). Native grid is 1°.';
  }
  if (years) {
    $('legend-title').textContent = `Currents scenario · Year ${scenarioYear()}`;
    $('legend-note').textContent = 'Fixed color scale across years. This is a simulation from the 2014 baseline.';
  }
  for (const band of SPI_BANDS) {
    const row = element('div', undefined, 'spi-band');
    const swatch = element('i'); swatch.style.background = `rgb(${band.color})`;
    row.append(swatch, element('span', band.name), element('span', band.range));
    $('spi-bands').append(row);
  }
}

function layers() {
  const global = $('map-style').value === 'global';
  const years = $('map-style').value === 'years';
  const gradient = years ? {frames: currentScenario ? [{
    image: `/hosted/current-scenario/year-${scenarioYear()}.png`, bounds: currentScenario.bounds,
  }] : []} : global ? {frames: globalPlastic ? [{
    image: '/hosted/global-plastic-2014.png', bounds: globalPlastic.bounds,
  }] : []} : state.gradient;
  return [...(!googleMap?createBasemapLayers({places:placeLabels,zoom:state.view?.zoom??2}):[]),...createMapLayers({tiles: state.tiles, protectedAreas: state.protected,
    spiVisible: $('heatmap-toggle').checked, protectedVisible: $('protected-toggle').checked,
    onTileClick: showTile, onProtectedClick: showProtected,gradient,
    viewStyle:$('map-style').value,onGradientClick:showGradientEstimate})];
}

function refreshLayers() {
  renderLegend();
  const next = layers(); overlay?.setProps({layers: next}); preview?.setProps({layers: next});
}

const cleanupPlanner = mountCleanupPlanner($('cleanup-planner'));
const currentTimeline = mountCurrentTimeline($('current-timeline'), loadGlobalPlastic);

function prefillCleanupCandidate(panel, coordinates, name, evidence) {
  if (!coordinates?.slice(0, 2).every(Number.isFinite) || coordinates.length < 2) return;
  const [lng, lat] = coordinates;
  const location = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  const applied = cleanupPlanner.stageTile(name || `Candidate near ${location}`,
    [`Map location: ${location}`, evidence].filter(Boolean).join(' · '));
  const block = element('div', undefined, 'cleanup-selection');
  const button = element('button', applied ? 'Review candidate' : 'Replace draft with this site', 'primary cleanup-review');
  button.type = 'button';
  button.onclick = () => cleanupPlanner.reviewTile();
  const timeline = element('button', 'Model over time', 'text-button');
  timeline.type = 'button';
  timeline.onclick = () => currentTimeline.selectPoint(coordinates);
  block.append(element('p', applied ? 'Cleanup candidate prefilled from this site.' : 'Your current edits are still in the planner.'), button, timeline);
  panel.prepend(block);
}

function useProtectedSite(feature, panel) {
  const position = featureFocus(feature);
  if (position) prefillCleanupCandidate(panel, [position.longitude, position.latitude], feature.properties.name,
    `Protected Planet: ${protectedAreaSummary(feature.properties)}`);
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
  prefillCleanupCandidate(box, p.center, null,
    `${classification?.name ?? 'Unclassified'} SPI · ${Number(p.densityPiecesKm2).toLocaleString()} floating pieces/km² · ${dates.join(', ') || 'Date unavailable'}`);
  const close = element('button', 'Close details', 'text-button'); close.onclick = () => { box.hidden = true; }; box.append(close);
}

function showProtected(feature) {
  const p = feature.properties, box = $('tile-info'); box.replaceChildren(); box.hidden = false;
  box.append(createProtectedAreaDetails(document, p));
  useProtectedSite(feature, box);
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
    let data;
    if(hostedMode)data=selectHostedPollution(await hostedDocument('pollution-snapshots',controller.signal),bounds,zoom).tiles;
    else {
      const response = await fetch(`/api/tiles?${params}`, {signal: controller.signal});
      if (!response.ok) throw new Error('Tile API unavailable');data=await response.json();
    }
    if (controller.signal.aborted || tilesRequest !== controller) return;
    state.tiles = data;
    $('detection-count').textContent = state.tiles.features.length.toLocaleString();
    if($('map-style').value==='tiles') $('map-empty').hidden = state.tiles.features.length > 0;
    const meta = state.tiles.metadata ?? state.tiles;
    const resolution = meta.resolutionKm2 ?? (zoom >= 13 ? 1 : zoom >= 11 ? 4 : zoom >= 8 ? 25 : 100);
    $('resolution').textContent = hostedMode?`${resolution} km² exported snapshot grid; fixed resolution. Only supported water is colored.`:`${resolution} km² grid • only supported water is colored`;
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
    let gradient;
    if(hostedMode)gradient=selectHostedPollution(await hostedDocument('pollution-snapshots',controller.signal),bounds,zoom).gradient;
    else{
      const response=await fetch(`/api/gradient?${params}`,{signal:controller.signal});
      if(!response.ok)throw new Error('Gradient unavailable');gradient=await response.json();
    }
    if(controller.signal.aborted||gradientRequest!==controller)return;
    state.gradient=gradient;refreshLayers();
    if($('map-style').value==='gradient')$('map-empty').hidden=gradient.frames.some(frame=>frame.supportedPixels>0);
    $('gradient-status').textContent=`${hostedMode?'Exported historical snapshot. ':''}Continuous blue-to-red concentration colors, with a square-root scale to show intermediate values. Smooth estimates stop 75 km from source samples. Transparent water lacks support. This is not measured coverage; SPI classification tiles retain the fixed thresholds.`;
  } catch(error) {
    if(error.name==='AbortError'||gradientRequest!==controller)return;
    $('gradient-status').textContent='Smooth layer unavailable. Check the local map service, or switch to source-supported survey tiles.';
  }
}

async function showGradientEstimate(coordinates) {
  if ($('map-style').value === 'years') {
    if (!currentScenario) return;
    const [rawLongitude, latitude] = coordinates;
    const longitude = ((rawLongitude + 180) % 360 + 360) % 360 - 180;
    const {bounds: [west, south, east, north], maskWidth, maskHeight, mask} = currentScenario;
    if (latitude <= south || latitude > north) return;
    const pixel = Math.floor((north - latitude) * maskHeight / (north - south)) * maskWidth
      + Math.floor((longitude - west) * maskWidth / (east - west));
    if (!(mask.charCodeAt(pixel >> 3) & (128 >> (pixel % 8)))) return;
    const year = scenarioYear();
    const ticket = ++scenarioPick;
    const box = $('tile-info');
    box.replaceChildren(element('p', 'Loading the modeled concentration…'));
    box.hidden = false;
    try {
      const [starting, selected] = await Promise.all([
        hostedDocument('current-scenario/year-0'), hostedDocument(`current-scenario/year-${year}`),
      ]);
      if (ticket !== scenarioPick || $('map-style').value !== 'years' || year !== scenarioYear()) return;
      const row = Math.floor(90 - latitude + 0.5);
      const col = (Math.floor(longitude + 0.5) + 360) % 360;
      const format = value => value == null ? 'Unavailable' : `${value.toLocaleString()} pieces/km²`;
      box.replaceChildren(element('h2', `Currents scenario · Year ${year}`),
        element('p', format(selected[row][col]), 'density-value'),
        element('p', `Year 0 baseline: ${format(starting[row][col])}`),
        element('p', `Location: ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°. Simulated values on a one-degree grid.`),
        sourceLink('NOAA monthly surface currents', currentSource));
    } catch {
      if (ticket !== scenarioPick) return;
      box.replaceChildren(element('p', 'The concentration for this year could not load. Try clicking again.'));
    }
    const close = element('button', 'Close details', 'text-button');
    close.onclick = () => { box.hidden = true; };
    box.append(close);
    return;
  }
  if ($('map-style').value === 'global') {
    if (!globalPlastic) return;
    const {bounds, maskWidth, maskHeight, mask, values} = globalPlastic;
    const [west, south, east, north] = bounds;
    const lng = ((coordinates[0] + 180) % 360 + 360) % 360 - 180;
    const lat = coordinates[1];
    if (lat <= south || lat > north) return;
    const x = Math.floor((lng - west) * maskWidth / (east - west));
    const y = Math.floor((north - lat) * maskHeight / (north - south));
    const index = y * maskWidth + x;
    if (!(mask.charCodeAt(index >> 3) & (128 >> (index % 8)))) return;
    const density = values[Math.floor(90 - lat + 0.5)][(Math.floor(lng + 0.5) + 360) % 360];
    if (density == null) return;
    const box = $('tile-info');
    const close = element('button', 'Close details', 'text-button');
    close.onclick = () => { box.hidden = true; };
    box.replaceChildren(element('h2', 'Modeled surface microplastics'),
      element('p', `${density.toLocaleString()} pieces/km²`, 'density-value'),
      element('p', `2014 estimate at ${lat.toFixed(2)}°, ${lng.toFixed(2)}°. One-degree grid cell.`),
      sourceLink('van Sebille et al. (2015) data · CC BY 4.0', globalSource), close);
    prefillCleanupCandidate(box, [lng, lat], null, `2014 global model · ${density.toLocaleString()} microplastic pieces/km²`);
    box.hidden = false;
    return;
  }
  if(hostedMode){
    const tile=tileAtPoint(state.tiles,coordinates);
    if(tile){showTile(tile);$('tile-info').prepend(element('p','Source-supported snapshot tile at this point. The gradient is a separate smoothed visualization.','notice'));}
    else {
      const box=$('tile-info');box.replaceChildren(element('h2','Smoothed snapshot overview'),element('p','There is no source-supported survey tile at this point. The gradient illustrates interpolation; it cannot provide a precise measured value here. Switch to survey tiles to inspect actual source support.'));
      prefillCleanupCandidate(box, coordinates, null, 'No survey density available at this point');
      const close=element('button','Close details','text-button');close.onclick=()=>box.hidden=true;box.append(close);box.hidden=false;
    }return;
  }
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
    const estimate = data.estimate;
    prefillCleanupCandidate(box, coordinates, null, estimate
      ? `Smoothed estimate · ${estimate.densityPiecesKm2.toLocaleString()} pieces/km² · ${estimate.observationDates.join(', ') || 'Date unavailable'}`
      : 'No survey density available at this point');
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
  if(!oceanVisible)return;
  viewportTimer = setTimeout(() => {
    if (!state.view && !googleMap) return;
    const bounds = viewBounds(state.view), zoom = googleMap?.getZoom() ?? state.view.zoom;
    const style = $('map-style').value;
    requestViewportData(bounds, zoom, {
      requestTiles: ['global', 'years'].includes(style) ? () => {} : requestTiles,
      requestProtected,
      protectedEnabled: $('protected-toggle').checked,
      requestGradient,
      gradientEnabled: style === 'gradient',
    });
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

function createPreview(message = 'Natural Earth map') {
  overlay?.finalize(); overlay = null; googleMap = null; mapLabel = message;
  if (preview) return;
  $('map').replaceChildren(); $('map-status').textContent = mapLabel;
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
  let data;
  try {const response=await fetch('/api/areas');if(!response.ok)throw Error('Areas API unavailable');data=await response.json();hostedMode=false;}
  catch {data=await hostedDocument('pollution-areas');hostedMode=true;}
  state.areas = data.areas;
  $('data-source').textContent = typeof data.source === 'string' ? data.source : (data.source?.name ?? 'Scientific observations. See individual tile sources.');
  if(hostedMode)$('data-source').textContent+=` Exported snapshot ${data.exportedAt?.slice(0,10)}; not a live feed. Hosted survey tiles retain a fixed ${data.resolutionKm2??1} km² grid across ${data.areas.length} observed regions. Observation dates and source links remain available; unsampled water is unknown.`;
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
  try {const response=await fetch('/globe/places.json');if(response.ok)placeLabels=(await response.json()).places??[];}catch{ /* Background still works without name labels. */ }
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
    } catch { createPreview('Natural Earth map · Google imagery unavailable'); }
  } else createPreview();
  if (state.area) selectArea(state.area); else { showSpecies(); scheduleViewport(state.view); }
}

$('random-area').onclick = () => selectArea(chooseArea(state.areas, state.area?.id));
$('area-select').onchange = event => selectArea(state.areas.find(area => area.id === event.target.value));
$('heatmap-toggle').onchange = () => { refreshLayers(); $('tile-info').hidden = true; };
$('map-style').onchange = async () => {
  scenarioPick++;
  tilesRequest?.abort();
  gradientRequest?.abort();
  $('tile-info').hidden = true;
  $('map-empty').hidden = true;
  const global = $('map-style').value === 'global';
  const years = $('map-style').value === 'years';
  $('scenario-year-controls').hidden = !years;
  $('cleanup-click-guide').textContent = years ? 'Move the year slider to see how the modeled concentration changes.'
    : 'Click a colored tile or protected boundary to prefill a cleanup candidate.';
  $('resolution').hidden = global || years;
  $('detection-count').closest('.observation-panel').hidden = global || years;
  refreshLayers();
  if (years) {
    $('map-status').textContent = 'Five-year currents scenario';
    $('gradient-status').textContent = 'Loading the five-year map…';
    try {
      currentScenario ??= await hostedDocument('current-scenario/index');
      currentScenario.mask ??= atob(currentScenario.supportMask);
    } catch {
      if ($('map-style').value === 'years') $('gradient-status').textContent = 'The five-year map could not load. Try selecting it again.';
      return;
    }
    if ($('map-style').value !== 'years') return;
    $('gradient-status').replaceChildren(
      document.createTextNode(`Uses repeating NOAA monthly mean currents and the 2014 baseline. Covers ${currentScenario.coverageOfBaseline}% of baseline ocean area. The same starting plastic is redistributed each year. No added pollution, removal, or year-specific forecast. `),
      sourceLink('NOAA current data', currentSource), document.createTextNode(' · '), sourceLink('2014 baseline', globalSource));
    state.view = {longitude: 0, latitude: 0, zoom: 1};
    if (googleMap) { googleMap.setCenter({lng: 0, lat: 0}); googleMap.setZoom(1); }
    preview?.setProps({initialViewState: state.view});
    refreshLayers();
  } else if (global) {
    $('map-status').textContent = 'Global modeled surface microplastics · 2014';
    $('gradient-status').textContent = 'Loading the historical global model…';
    try {
      await loadGlobalPlastic();
    } catch {
      if ($('map-style').value === 'global') $('gradient-status').textContent = 'The global model could not load. Choose another view or try again.';
      return;
    }
    if ($('map-style').value !== 'global') return;
    $('gradient-status').replaceChildren(
      document.createTextNode(`2014 modeled microplastics cover ${globalPlastic.waterCoverage}% of mapped ocean area. `),
      sourceLink('Study data', globalSource));
    state.view = {longitude: 0, latitude: 0, zoom: 1};
    if (googleMap) { googleMap.setCenter({lng: 0, lat: 0}); googleMap.setZoom(1); }
    preview?.setProps({initialViewState: state.view});
    refreshLayers();
  } else if ($('map-style').value === 'tiles') {
    $('gradient-status').textContent = 'Select a survey tile to see its estimated density and source.';
  }
  scheduleViewport(state.view);
};
$('scenario-year').oninput = () => {
  scenarioPick++;
  $('tile-info').hidden = true;
  $('scenario-year-label').textContent = `Year ${scenarioYear()}`;
  $('scenario-year').setAttribute('aria-valuetext', `Year ${scenarioYear()}`);
  refreshLayers();
};
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
$('cleanup-pick-map').addEventListener('click', event => {
  event.preventDefault();
  explorerShell?.selectMode('ocean');
  $('pollution-view').scrollIntoView({block: 'start'});
});
start().then(()=>{
  explorerShell=mountExplorerSwitch({document,onProtectedSite:useProtectedSite,getOceanView:()=>{
    if(googleMap){const center=googleMap.getCenter();return {longitude:center.lng(),latitude:center.lat(),zoom:googleMap.getZoom()};}
    return state.view;
  },setOceanView:view=>{
    state.view={longitude:view.longitude,latitude:view.latitude,zoom:view.zoom};
    if(googleMap){googleMap.setCenter({lng:view.longitude,lat:view.latitude});googleMap.setZoom(view.zoom);}
    preview?.setProps({initialViewState:state.view});scheduleViewport(state.view);
  },onOceanVisibility:visible=>{oceanVisible=visible;$('cleanup-click-guide').hidden=!visible;scheduleViewport(state.view);}});
  if (new URLSearchParams(location.search).get('scenario') === 'years' && oceanVisible) {
    $('map-style').value = 'years';
    $('map-style').onchange();
  }
}).catch(() => { $('map-status').textContent = 'Explorer could not start. Refresh to try again.'; });
window.addEventListener('pagehide',()=>{currentTimeline.destroy();explorerShell?.destroy();preview?.finalize();overlay?.finalize();clearTimeout(viewportTimer);tilesRequest?.abort();gradientRequest?.abort();protectedRequest?.abort();},{once:true});
