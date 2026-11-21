"""Convert the original MARIDA zip to a reproducible YOLO detection dataset."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import zipfile

import geo_runtime  # Select bundled projection data before importing rasterio.
import numpy as np
from PIL import Image
from rasterio.io import MemoryFile
import yaml

from satellite_data import RGB_BANDS, REFLECTANCE_MAX, debris_boxes, render_rgb, validate_splits


def read_tiff(archive, name):
    with MemoryFile(archive.read(name)) as memory, memory.open() as ds:
        return ds.read(), {
            'shape': [ds.count, ds.height, ds.width], 'dtype': ds.dtypes[0],
            'band_descriptions': list(ds.descriptions), 'scales': list(ds.scales),
            'offsets': list(ds.offsets), 'crs': str(ds.crs),
            'transform': list(ds.transform),
        }


def prepare(archive_path: Path, output: Path, overwrite: bool = False):
    if output.exists() and any(output.iterdir()) and not overwrite:
        raise ValueError(f'Output must be empty to prevent stale labels: {output}')
    with archive_path.open('rb') as source:
        source_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        images = {Path(n).stem: n for n in names if n.startswith('patches/')
                  and n.endswith('.tif') and not n.endswith(('_cl.tif', '_conf.tif'))}
        splits = {
            split: ['S2_' + line.strip() for line in
                    archive.read(f'splits/{split}_X.txt').decode().splitlines() if line.strip()]
            for split in ('train', 'val', 'test')
        }
        validate_splits(splits, set(images))
        for name in images.values():
            for suffix in ('_cl.tif', '_conf.tif'):
                if name[:-4] + suffix not in names:
                    raise ValueError(f'Missing paired mask: {name[:-4] + suffix}')
        report = {'archive': str(archive_path.resolve()), 'archive_sha256': source_hash,
                  'preprocessing': {'rgb_bands_one_based': RGB_BANDS,
                                    'reflectance_range': [0, REFLECTANCE_MAX],
                                    'rendering': 'clip, multiply by 255, round to nearest uint8',
                                    'source_class_id': 1, 'yolo_class_id': 0,
                                    'connectivity': 8, 'minimum_component_pixels': 1},
                  'splits': {}, 'patches': []}
        for split, patch_ids in splits.items():
            image_dir = output / 'images' / split
            label_dir = output / 'labels' / split
            image_dir.mkdir(parents=True, exist_ok=True)
            label_dir.mkdir(parents=True, exist_ok=True)
            area_counts = Counter()
            positives = boxes_total = debris_pixels = labeled_pixels = 0
            for index, patch_id in enumerate(patch_ids):
                name = images[patch_id]
                bands, metadata = read_tiff(archive, name)
                mask, _ = read_tiff(archive, name[:-4] + '_cl.tif')
                confidence, _ = read_tiff(archive, name[:-4] + '_conf.tif')
                if bands.shape != (11, 256, 256) or mask.shape != (1, 256, 256):
                    raise ValueError(f'Unexpected image/mask dimensions: {name}')
                if confidence.shape != mask.shape or not np.isin(mask, np.arange(16)).all():
                    raise ValueError(f'Invalid mask: {name}')
                if metadata['scales'] != [1.0] * 11 or metadata['offsets'] != [0.0] * 11:
                    raise ValueError(f'Unexpected reflectance scale/offset: {name}')
                metadata['nonfinite_pixels_per_band'] = (~np.isfinite(bands)).sum(axis=(1, 2)).tolist()
                invalid_rgb = ~np.isfinite(bands[[3, 2, 1]]).all(axis=0)
                metadata['rgb_nodata_pixels'] = int(invalid_rgb.sum())
                if ((mask[0] > 0) & invalid_rgb).any():
                    raise ValueError(f'Annotated pixels overlap visible-band gaps: {name}')
                try:
                    rgb = render_rgb(bands)
                except ValueError as error:
                    raise ValueError(f'{name}: {error}') from error
                boxes, areas = debris_boxes(mask[0])
                for box in boxes:
                    x, y, w, h = box
                    if not (0 < w <= 1 and 0 < h <= 1 and
                            0 <= x-w/2 <= x+w/2 <= 1 and 0 <= y-h/2 <= y+h/2 <= 1):
                        raise ValueError(f'Out-of-bounds box in {name}: {box}')
                Image.fromarray(rgb).save(image_dir / f'{patch_id}.png')
                (label_dir / f'{patch_id}.txt').write_text(
                    ''.join('0 ' + ' '.join(f'{v:.8f}' for v in box) + '\n' for box in boxes),
                    encoding='utf-8')
                area_counts.update(areas)
                boxes_total += len(boxes)
                positives += bool(boxes)
                debris_pixels += int((mask == 1).sum())
                labeled_pixels += int((mask > 0).sum())
                report['patches'].append({
                    'id': patch_id, 'split': split, 'source': name, 'metadata': metadata,
                    'boxes': len(boxes), 'component_areas_pixels': areas,
                    'debris_confidence_counts': {
                        str(level): int(((mask == 1) & (confidence == level)).sum())
                        for level in (1, 2, 3)},
                })
                if (index + 1) % 100 == 0:
                    print(f'{split}: {index + 1}/{len(patch_ids)}', flush=True)
            report['splits'][split] = {
                'images': len(patch_ids), 'positive_images': positives,
                'background_images': len(patch_ids) - positives, 'boxes': boxes_total,
                'debris_pixels': debris_pixels, 'labeled_pixels': labeled_pixels,
                'component_area_histogram': dict(sorted(area_counts.items())),
            }
            expected = set(patch_ids)
            if {p.stem for p in image_dir.glob('*.png')} != expected or \
                    {p.stem for p in label_dir.glob('*.txt')} != expected:
                raise ValueError(f'Stale or missing output files in {split}')
        report['preprocessing']['rgb_nodata'] = 'All three channels zeroed at nonfinite visible pixels; annotated overlaps rejected'
        (output / 'data.yaml').write_text(yaml.safe_dump({
            'path': output.resolve().as_posix(), 'train': 'images/train',
            'val': 'images/val', 'test': 'images/test', 'names': {0: 'marine_debris'},
        }, sort_keys=False), encoding='utf-8')
        (output / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report['splits'], indent=2), flush=True)
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=Path('MARIDA.zip'))
    parser.add_argument('--output', type=Path, default=Path('data/marida_yolo'))
    parser.add_argument('--overwrite', action='store_true', help='Regenerate known output files in place')
    args = parser.parse_args()
    prepare(args.archive, args.output, args.overwrite)
