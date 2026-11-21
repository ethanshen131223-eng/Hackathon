export function chooseArea(areas, currentId = null, random = Math.random) {
  const candidates = areas.length > 1 ? areas.filter(area => area.id !== currentId) : areas;
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

export function filterDetections(points, areaId, minimumConfidence) {
  return points.filter(point => point.areaId === areaId && point.confidence >= minimumConfidence);
}
