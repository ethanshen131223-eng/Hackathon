"""Georeference satellite model detections for the local map explorer."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

import geo_runtime
from affine import Affine
from rasterio.warp import transform

ROOT = Path(__file__).resolve().parent

AREA_NAMES = {
    '16PCC': 'Motagua River coast', '16PDC': 'Ulúa River coast',
    '16PEC': 'La Ceiba coast', '16QED': 'Roatán', '18QWF': 'Haiti coast',
    '18QYF': 'Haiti coast', '18QYG': 'Haiti coast', '19QDA': 'Santo Domingo',
    '30VWH': 'Scotland coast', '36JUN': 'Durban coast', '48MXU': 'Jakarta Bay',
    '48MYU': 'Jakarta Bay', '48PZC': 'Da Nang coast', '50LLR': 'Bali coast',
    '51RVQ': 'Yangtze estuary', '52SDD': 'Nakdong estuary', '51PTS': 'Manila Bay',
}


def box_center_wgs84(metadata, box):
    """Convert the center of an xyxy image box through its original TIFF CRS."""
    x1, y1, x2, y2 = box
    pixel_x, pixel_y = (x1 + x2) / 2, (y1 + y2) / 2
    x, y = Affine(*metadata['transform'][:6]) @ (pixel_x, pixel_y)
    longitude, latitude = transform(metadata['crs'], 'EPSG:4326', [x], [y])
    return [longitude[0], latitude[0]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=ROOT / 'data/marida_yolo')
    parser.add_argument('--weights', type=Path,
                        default=ROOT / 'models/marineguarder_satellite_yolo11n.pt')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/detections.json')
    parser.add_argument('--device', default='0')
    args = parser.parse_args()
    os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.config/ultralytics'))
    from ultralytics import YOLO

    manifest = json.loads((args.dataset / 'manifest.json').read_text(encoding='utf-8'))
    patches = {p['id']: p for p in manifest['patches'] if p['split'] == 'test'}
    sources = [str(args.dataset / 'images/test' / f'{key}.png') for key in sorted(patches)]
    model = YOLO(str(args.weights))
    detections, groups = [], {}
    for result in model.predict(sources, stream=True, batch=16, imgsz=512, conf=0.25,
                                device=args.device, verbose=False):
        patch_id = Path(result.path).stem
        patch = patches[patch_id]
        _, date, tile, _ = patch_id.split('_')
        day, month, year = date.split('-')
        captured = f'20{year}-{int(month):02d}-{int(day):02d}'
        for box in result.boxes:
            position = box_center_wgs84(patch['metadata'], box.xyxy[0].tolist())
            point = {'areaId': tile, 'position': position, 'confidence': float(box.conf.item()),
                     'patchId': patch_id, 'captured': captured}
            detections.append(point)
            groups.setdefault(tile, []).append(point)
    areas = []
    for tile, points in sorted(groups.items()):
        lons = [p['position'][0] for p in points]
        lats = [p['position'][1] for p in points]
        areas.append({'id': tile, 'name': AREA_NAMES.get(tile, tile),
                      'center': [sum(lons) / len(lons), sum(lats) / len(lats)],
                      'bounds': [min(lons), min(lats), max(lons), max(lats)],
                      'dates': sorted({p['captured'] for p in points})})
    with args.weights.open('rb') as source:
        weights_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    payload = {'status': 'model_detections', 'generatedUtc': datetime.now(timezone.utc).isoformat(),
               'source': 'YOLO11n detections on historical MARIDA held-out test images',
               'archiveSha256': manifest['archive_sha256'], 'weightsSha256': weights_hash,
               'minimumConfidence': 0.25,
               'interpretation': 'Confidence-weighted detection density, not plastic concentration '
                                 'or a live risk score. Google supplies only the basemap.',
               'areas': areas, 'detections': detections}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Exported {len(detections)} model detections in {len(areas)} study areas to {args.output}')


if __name__ == '__main__':
    main()
