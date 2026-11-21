import {DATASET_CASES} from './dataset-cases.js';
import {containsPoint} from './outlines.js';
// Training truth is authored for these illustrations. It is not an image-model result.
const INGESTION = 'https://marinedebris.noaa.gov/why-marine-debris-problem/ingestion';
const ENTANGLEMENT = 'https://marinedebris.noaa.gov/why-marine-debris-problem/wildlife-entanglement-and-ghost-fishing';
const PLASTICS = 'https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html';
const MEASURED = 'Illustrated scenario measurement';

export const SIZE_CATEGORIES = [
  { id: 'micro', label: 'Microplastic', range: 'Less than 5 mm' },
  { id: 'small', label: 'Small debris', range: '5 to less than 10 mm' },
  { id: 'medium', label: 'Medium debris', range: '10 to less than 50 mm' },
  { id: 'large', label: 'Large debris', range: '50 to 100 mm' },
  { id: 'oversized', label: 'Oversized debris', range: 'More than 100 mm' },
];

/** Size bins used by this game; only the <5 mm microplastic threshold is a NOAA definition. */
export function classifySize(sizeMm) {
  if (typeof sizeMm !== 'number' || !Number.isFinite(sizeMm) || sizeMm <= 0) return null;
  return SIZE_CATEGORIES[sizeMm < 5 ? 0 : sizeMm < 10 ? 1 : sizeMm < 50 ? 2 : sizeMm <= 100 ? 3 : 4];
}

export const CASES = DATASET_CASES;

/** Coordinates and hit radii use the scene’s normalized 0–1 coordinate system. */
export function hitTest(caseData, x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const [kind, items] of [['target', caseData.targets], ['distractor', caseData.distractors]]) {
    for (const item of items ?? []) {
      const distance = Math.hypot(x - item.x, y - item.y);
      const inside = containsPoint(item,{x,y});
      if (inside && distance < nearestDistance) {
        nearest = { ...item, kind };
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

/** Precision is 0–1; unknown IDs are ignored and repeated selections count once. */
export function scoreFindings(caseData, selectedIds = []) {
  const selected = new Set(Array.isArray(selectedIds) || selectedIds instanceof Set ? selectedIds : []);
  const foundIds = caseData.targets.filter((item) => selected.has(item.id)).map((item) => item.id);
  const missedIds = caseData.targets.filter((item) => !selected.has(item.id)).map((item) => item.id);
  const falsePositives = caseData.distractors.filter((item) => selected.has(item.id)).length;
  const correct = foundIds.length;
  const total = caseData.targets.length;
  return {
    correct, total, falsePositives, foundIds, missedIds,
    complete: total > 0 && correct === total && falsePositives === 0,
    accuracy: correct + falsePositives > 0 ? correct / (correct + falsePositives) : 0,
  };
}

/** The caller supplies a local calendar day key; selection itself never uses a timezone. */
export function dailyCase(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const timestamp = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dayKey) return null;
  const day = Math.floor(timestamp / 86_400_000);
  return CASES[((day % CASES.length) + CASES.length) % CASES.length];
}

