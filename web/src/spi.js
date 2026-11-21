export const SPI_BANDS = [
  {name: 'Severe', minimum: 600, range: '≥600', color: [210, 47, 47]},
  {name: 'High', minimum: 200, range: '200–<600', color: [239, 133, 35]},
  {name: 'Medium', minimum: 100, range: '100–<200', color: [240, 209, 53]},
  {name: 'Low', minimum: 50, range: '50–<100', color: [54, 157, 91]},
  {name: 'Very Low', minimum: 0, range: '0–<50', color: [48, 126, 216]},
];

export function classifySPI(density) {
  if (typeof density !== 'number' || !Number.isFinite(density) || density < 0) return null;
  return SPI_BANDS.find(band => density >= band.minimum);
}
