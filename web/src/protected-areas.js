export const PROTECTED_AREAS_SOURCE_URL = 'https://www.protectedplanet.net/en';
export const PROTECTED_AREAS_SERVICE = 'https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/WDPA_Marine_and_Coastal/FeatureServer/1';
const MAX_FEATURES = 200;
const FIELDS = 'objectid,site_id,site_pid,name_eng,name,desig_eng,desig,status,site_type,realm';

export class ProtectedAreasError extends Error {
  constructor(message, code, cause) {
    super(message, {cause});
    this.name = 'ProtectedAreasError';
    this.code = code;
  }
}

async function getJson(url, signal) {
  let response;
  try {
    response = await fetch(url, {signal});
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ProtectedAreasError('Protected-area boundaries could not be reached. Please try again.', 'NETWORK', error);
  }
  if (!response.ok) {
    throw new ProtectedAreasError(`Protected-area service returned HTTP ${response.status}.`, 'HTTP');
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ProtectedAreasError('Protected-area service returned an unreadable response.', 'INVALID_RESPONSE', error);
  }
  if (data?.error) {
    throw new ProtectedAreasError('Protected-area service could not complete this query.', 'SERVICE');
  }
  return data;
}

function queryUrl(bounds, maxFeatures, generalizationDegrees) {
  const params = new URLSearchParams({
    f: 'geojson', where: "site_type = 'PA' AND realm IN ('Marine','Coastal')",
    geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: FIELDS, returnGeometry: 'true', resultRecordCount: String(maxFeatures),
    orderByFields: 'objectid ASC', maxAllowableOffset: String(generalizationDegrees), geometryPrecision: '5',
  });
  return `${PROTECTED_AREAS_SERVICE}/query?${params}`;
}

/**
 * Fetch official marine/coastal protected polygons intersecting WGS84
 * [west,south,east,north] bounds. A west > east viewport crosses the date line.
 * Results are display geometry, capped at 200, with live layer attribution.
 * Empty results are valid; failures reject instead of silently returning [].
 */
export async function queryProtectedAreas(bounds, {signal, maxFeatures = MAX_FEATURES, generalizationDegrees = 0.0005} = {}) {
  if (!Number.isInteger(maxFeatures) || maxFeatures < 1 || maxFeatures > MAX_FEATURES ||
      !Number.isFinite(generalizationDegrees) || generalizationDegrees < 0.0005 || generalizationDegrees > 0.1) {
    throw new ProtectedAreasError('Choose valid display geometry limits.', 'INVALID_OPTIONS');
  }
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      Math.abs(bounds[0]) > 180 || Math.abs(bounds[2]) > 180 ||
      Math.abs(bounds[1]) > 90 || Math.abs(bounds[3]) > 90 ||
      bounds[1] >= bounds[3] || bounds[0] === bounds[2]) {
    throw new ProtectedAreasError('Choose valid geographic map bounds.', 'INVALID_BOUNDS');
  }
  signal?.throwIfAborted();
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const [west, south, east, north] = bounds;
  const envelopes = west > east ? [[west, south, 180, north], [-180, south, east, north]] : [bounds];
  const [metadata, ...collections] = await Promise.all([
    getJson(`${PROTECTED_AREAS_SERVICE}?f=json`, requestSignal),
    ...envelopes.map(envelope => getJson(queryUrl(envelope, maxFeatures, generalizationDegrees), requestSignal)),
  ]);
  if (!metadata || typeof metadata.copyrightText !== 'string' ||
      collections.some(data => data?.type !== 'FeatureCollection' || !Array.isArray(data.features))) {
    throw new ProtectedAreasError('Protected-area service returned an unexpected format.', 'INVALID_RESPONSE');
  }
  const unique = new Map();
  for (const feature of collections.flatMap(collection => collection.features)) {
    const p = feature.properties;
    if (!p || p.site_type !== 'PA' || !['Marine', 'Coastal'].includes(p.realm) ||
        !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) ||
        !Array.isArray(feature.geometry.coordinates)) continue;
    const id = p.site_pid || p.site_id || p.objectid;
    if (id === null || id === undefined || id === '') continue;
    unique.set(String(id), {
      type: 'Feature', id: String(id), geometry: feature.geometry,
      properties: {
        id: String(id), name: p.name_eng || p.name || 'Unnamed protected area',
        sourceUrl: Number.isSafeInteger(p.site_id) && p.site_id > 0
          ? `https://www.protectedplanet.net/${p.site_id}` : PROTECTED_AREAS_SOURCE_URL,
        designation: p.desig_eng || p.desig || null,
        status: p.status || null, kind: 'Protected area', realm: p.realm,
      },
    });
  }
  const truncated = unique.size > maxFeatures || collections.some(collection =>
    collection.exceededTransferLimit === true ||
    (collection.features.length >= maxFeatures && typeof collection.exceededTransferLimit !== 'boolean'));
  return {
    type: 'FeatureCollection', features: [...unique.values()].slice(0, maxFeatures),
    sourceUrl: PROTECTED_AREAS_SOURCE_URL, attribution: metadata.copyrightText,
    version: metadata.copyrightText.match(/\[([A-Za-z]+\s+\d{4})\]/)?.[1] || 'Version not supplied',
    versionBasis: 'Live polygon-layer citation',
    truncated, maxFeatures,
    geometryGeneralizationDegrees: generalizationDegrees,
  };
}
