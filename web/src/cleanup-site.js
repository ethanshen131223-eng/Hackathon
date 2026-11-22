export const WATERBODY_SOURCE = 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/';

function insideRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i];
    const [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}

export function identifyWaterbody(areas, [longitude, latitude]) {
  const x = ((longitude + 180) % 360 + 360) % 360 - 180;
  for (const [name, type, [west, south, east, north], [outer, ...holes]] of areas) {
    if (x < west || x > east || latitude < south || latitude > north) continue;
    if (insideRing(x, latitude, outer) && !holes.some(hole => insideRing(x, latitude, hole))) {
      return {name, type};
    }
  }
  return null;
}

export function classifyCleanupSite({location, evidence, setting}) {
  if (setting) return setting;
  if (evidence?.kind === 'protected') return 'protected';
  if (evidence?.kind === 'river' || location?.type === 'river') return 'river';
  if (evidence?.kind === 'beach') return 'shore';
  if (location?.type === 'reef') return 'offshore';
  if (['bay','gulf','sound','lagoon','fjord','inlet','channel','strait'].includes(location?.type)) return 'bay';
  if (['ocean','sea'].includes(location?.type)) return 'offshore';
  return '';
}

export function cleanupPriority(site, assessment) {
  if (assessment.benefit !== null) {
    const level = assessment.density >= 100 ? 'high' : assessment.density >= 25 ? 'moderate' : 'low';
    return {level, kind:'shoreline', label:`${assessment.density.toFixed(1)} visible items per 100 m from a recent survey. Planning cutoffs: 25 and 100 items per 100 m.`};
  }
  const evidence = site.evidence;
  if (evidence?.kind === 'river' && Number.isFinite(evidence.value)) {
    // Rounded 75th/90th percentiles of positive estimates in the bundled Meijer dataset.
    const level = evidence.value >= 36.74 ? 'high' : evidence.value >= 7.24 ? 'moderate' : 'low';
    return {level, kind:'river', label:`${evidence.value.toLocaleString()} modeled tonnes/year. Relative priority within the Meijer outfall dataset.`};
  }
  const bands = {Severe:'high', High:'high', Medium:'moderate', Low:'low', 'Very Low':'low'};
  if (evidence?.kind === 'spi' && Object.hasOwn(bands, evidence.band)) {
    return {level:bands[evidence.band], kind:'spi', label:`${evidence.band} SPI for floating particles. This guides verification and monitoring.`};
  }
  return {level:'unknown', kind:'unknown', label:'Comparable recent litter or source-specific severity data are unavailable.'};
}

export function cleanupAction(setting, severity, hold) {
  if (hold) return 'Pause fieldwork and contact the site manager about access or unsafe conditions.';
  const {level, kind} = severity;
  if (setting === 'protected') return level === 'high'
    ? 'Send the hotspot location and available evidence to the protected-area manager for priority assessment.'
    : 'Ask the protected-area manager for an approved survey route before planning removal.';
  if (setting === 'river') {
    if (kind !== 'river') return 'Ask the waterway authority to verify floating litter from a safe bank location.';
    if (level === 'high') return 'Send the modeled hotspot to the waterway authority and request a multi-flow monitoring and interception assessment.';
    if (level === 'moderate') return 'Request repeat bank observations in different flow conditions and check upstream sources.';
    return 'Start with upstream litter prevention and a repeat bank survey before considering equipment.';
  }
  if (setting === 'bay') return level === 'high'
    ? 'Share the hotspot with the harbor or coastal manager and request surveys of sheltered accumulation points.'
    : 'Ask the coastal manager to check accessible accumulation points along the shoreline.';
  if (setting === 'offshore') return level === 'high'
    ? 'Share the hotspot with a marine monitoring program for targeted sampling. Report any separately verified large debris to the marine authority.'
    : 'Record the coordinates and monitor. Refer confirmed hazardous or entangled gear to the marine authority.';
  if (setting === 'shore' && kind === 'shoreline') {
    if (level === 'high') return 'Ask a local cleanup organizer to prioritize this surveyed stretch and arrange access and disposal.';
    if (level === 'moderate') return 'Schedule a targeted hand pickup with an organizer once access and conditions are confirmed.';
    return 'Recount the same stretch on the next survey and document recurring litter sources.';
  }
  return 'Verify an accessible shoreline and record visible litter along a measured stretch before deciding on removal.';
}
