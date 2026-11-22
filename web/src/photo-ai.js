const MODEL = 'Xenova/owlvit-base-patch32';
const LABELS = [
  'plastic bottle', 'plastic bag', 'food wrapper', 'aluminum can',
  'glass bottle', 'plastic cup', 'foam container', 'discarded fishing net',
  'discarded rope', 'cigarette butt', 'plastic bottle cap',
];
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let modelPromise;

export function photoSuggestions(predictions) {
  const results = [];
  for (const {label, score, box} of [...predictions].sort((a, b) => b.score - a.score)) {
    if (!LABELS.includes(label) || !Number.isFinite(score) || score < 0.12 || score > 1 || !box) continue;
    const values = [box.xmin, box.ymin, box.xmax, box.ymax];
    if (!values.every(Number.isFinite)) continue;
    const [xmin, ymin, xmax, ymax] = values.map(value => Math.max(0, Math.min(1, value)));
    const area = (xmax - xmin) * (ymax - ymin);
    if (xmax <= xmin || ymax <= ymin || area > 0.9) continue;
    const overlaps = results.some(({box: other}) => {
      const intersection = Math.max(0, Math.min(xmax, other.xmax) - Math.max(xmin, other.xmin))
        * Math.max(0, Math.min(ymax, other.ymax) - Math.max(ymin, other.ymin));
      const otherArea = (other.xmax - other.xmin) * (other.ymax - other.ymin);
      return intersection / (area + otherArea - intersection) >= 0.55;
    });
    if (!overlaps) results.push({label, score, box: {xmin, ymin, xmax, ymax}});
    if (results.length === 12) break;
  }
  return results;
}

export async function detectPhotoTrash(photoDataUrl, onAnalyzing) {
  if (!/^data:image\/(?:webp|png|jpeg);base64,/i.test(photoDataUrl)) {
    throw new Error('Expected a local photo preview.');
  }
  modelPromise ??= import(/* @vite-ignore */ RUNTIME).then(async ({pipeline, RawImage, env}) => {
    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;
    const detector = await pipeline('zero-shot-object-detection', MODEL, {
      device: 'wasm', dtype: 'q8', revision: 'b75f4e52949639c3bb0b96546ea4149482f6e7ef',
    });
    return {detector, RawImage};
  }).catch(error => {
    modelPromise = undefined;
    throw error;
  });
  const {detector, RawImage} = await modelPromise;
  onAnalyzing?.();
  const image = await RawImage.read(photoDataUrl);
  const predictions = await detector(image, LABELS, {threshold: 0.12, percentage: true});
  return photoSuggestions(predictions);
}
