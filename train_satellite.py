"""Fine-tune YOLO11n on prepared MARIDA data, then evaluate held-out test once."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import time

ROOT = Path(__file__).resolve().parent
os.environ.setdefault('YOLO_CONFIG_DIR', str(ROOT / '.config' / 'ultralytics'))

import torch
from ultralytics import YOLO
import ultralytics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'data/marida_yolo/data.yaml')
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--imgsz', type=int, default=512)
    parser.add_argument('--patience', type=int, default=20)
    parser.add_argument('--device', default='0')
    parser.add_argument('--name', default='satellite_yolo11n')
    parser.add_argument('--resume', type=Path, help='Resume an interrupted last.pt checkpoint')
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is required for this training run; check the GPU PyTorch install')
    if args.epochs <= 0 or args.batch <= 0:
        parser.error('epochs and batch must be positive')
    manifest_path = args.data.parent / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    run_dir = ROOT / 'runs' / args.name
    if not args.resume and run_dir.exists():
        raise FileExistsError(f'{run_dir} already exists; use --resume or a different --name')
    started = time.monotonic()
    info = {
        'started_utc': datetime.now(timezone.utc).isoformat(),
        'python': platform.python_version(), 'torch': torch.__version__,
        'ultralytics': ultralytics.__version__, 'cuda': torch.version.cuda,
        'gpu': torch.cuda.get_device_name(int(args.device)),
        'archive_sha256': manifest['archive_sha256'],
        'preprocessing': manifest['preprocessing'],
        'split_statistics': manifest['splits'],
        'requested_arguments': {k: str(v) if isinstance(v, Path) else v
                                for k, v in vars(args).items()},
        'warning': 'Weak-mask-derived boxes; scores do not establish individual litter detection '
                   'or concentration/physical-size estimation. RGB channels only.',
    }
    model = YOLO(str(args.resume) if args.resume else 'yolo11n.pt')
    if args.resume:
        model.train(resume=True)
    else:
        model.train(
            data=str(args.data.resolve()), epochs=args.epochs, patience=args.patience,
            batch=args.batch, imgsz=args.imgsz, device=args.device, seed=42,
            deterministic=True, workers=0, cache='ram', project=str(ROOT / 'runs'),
            name=args.name, pretrained=True, plots=True, save=True, exist_ok=False,
        )
    actual_run = Path(model.trainer.save_dir)
    best_path = actual_run / 'weights/best.pt'
    best = YOLO(str(best_path))
    # Validation chooses the checkpoint; this is the only held-out test evaluation.
    test = best.val(data=str(args.data.resolve()), split='test', imgsz=args.imgsz,
                    batch=args.batch, device=args.device, workers=0, plots=True,
                    project=str(actual_run), name='test')
    info['test_metrics'] = {key: float(value) for key, value in test.results_dict.items()}
    info['test_metrics_note'] = ('Ultralytics precision/recall use its curve-selected operating '
                                 'point; example predictions independently use confidence 0.25.')
    with (actual_run / 'results.csv').open(newline='', encoding='utf-8') as f:
        history = list(csv.DictReader(f))
    info['epochs_completed'] = len(history)
    info['elapsed_seconds'] = time.monotonic() - started
    output = ROOT / 'models'
    output.mkdir(exist_ok=True)
    for source_name, destination in [('best.pt', 'marineguarder_satellite_yolo11n.pt'),
                                     ('last.pt', 'marineguarder_satellite_last.pt')]:
        source = actual_run / 'weights' / source_name
        shutil.copy2(source, output / destination)
    info['best_checkpoint_sha256'] = hashlib.file_digest(best_path.open('rb'), 'sha256').hexdigest()
    info['run_dir'] = str(actual_run)
    reports = ROOT / 'reports'
    reports.mkdir(exist_ok=True)
    (reports / 'training_metrics.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    (output / 'preprocessing.json').write_text(json.dumps(info['preprocessing'], indent=2),
                                              encoding='utf-8')
    # Reload the delivered file and use a predetermined small group of test patches for examples.
    delivered = YOLO(str(output / 'marineguarder_satellite_yolo11n.pt'))
    example_dir = args.data.parent / 'images/test'
    examples = sorted(example_dir.glob('*.png'))[:8]
    delivered.predict(source=[str(p) for p in examples], imgsz=args.imgsz, conf=0.25,
                      device=args.device, save=True, save_txt=True, save_conf=True,
                      project=str(reports), name='example_predictions', exist_ok=True)
    print(json.dumps({k: info[k] for k in ('epochs_completed', 'elapsed_seconds', 'test_metrics')},
                     indent=2), flush=True)


if __name__ == '__main__':
    main()
