export function normalizeBounds([west, south, east, north]) {
  if (Math.abs(east - west) >= 360) return [-180, Math.max(-90, south), 180, Math.min(90, north)];
  const wrap = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;
  return [wrap(west), Math.max(-90, south), wrap(east), Math.min(90, north)];
}

export function sourceUrls(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).filter(url => {
    if (typeof url !== 'string') return false;
    try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
  }))];
}

export function requestViewportData(bounds, zoom, {requestTiles, requestProtected, protectedEnabled,requestGradient,gradientEnabled=false}) {
  // Start independent source requests before waiting for either one.
  const requests = [requestTiles(bounds, zoom)];
  if (protectedEnabled) requests.push(requestProtected(bounds));
  if (gradientEnabled && requestGradient) requests.push(requestGradient(bounds,zoom));
  return Promise.allSettled(requests);
}
