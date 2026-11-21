"""Predict approximate debris regions on a MARIDA TIFF or prepared RGB PNG."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.config' / 'ultralytics'))

import geo_runtime
import cv2
import rasterio
from ultralytics import YOLO

from satellite_data import render_rgb


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--weights', type=Path,
                        default=ROOT / 'models/marineguarder_satellite_yolo11n.pt')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/predictions')
    parser.add_argument('--confidence', type=float, default=0.25)
    parser.add_argument('--device', default='cpu', help='cpu or CUDA device index, e.g. 0')
    args = parser.parse_args()
    if not 0 <= args.confidence <= 1:
        parser.error('confidence must be between 0 and 1')
    if args.source.suffix.lower() in ('.tif', '.tiff'):
        with rasterio.open(args.source) as ds:
            rgb = render_rgb(ds.read())
        source = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)  # Ultralytics numpy input is BGR.
    else:
        source = str(args.source)
    model = YOLO(str(args.weights))
    result = model.predict(source, imgsz=512, conf=args.confidence, device=args.device,
                           verbose=False)[0]
    args.output.mkdir(parents=True, exist_ok=True)
    result.save(filename=str(args.output / f'{args.source.stem}_detections.jpg'))
    payload = {
        'source': str(args.source.resolve()), 'model': str(args.weights.resolve()),
        'confidence_threshold': args.confidence,
        'interpretation': 'Approximate debris regions; not individual item counts or concentration.',
        'detections': [{'category': 'marine_debris', 'confidence': float(box.conf),
                         'xyxy_pixels': box.xyxy[0].tolist()}
                        for box in result.boxes],
    }
    (args.output / f'{args.source.stem}.json').write_text(json.dumps(payload, indent=2),
                                                        encoding='utf-8')
    print(json.dumps(payload, indent=2))


if __name__ == '__main__':
    main()
