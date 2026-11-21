# MarineGUARDer satellite training

## Scope

Train an initial YOLO11n satellite debris detector using the supplied `MARIDA.zip`. Defer the app, surface-camera model, ImaMPs microplastics model, games, and multiplayer until the other files arrive.

## Findings

- The workspace currently contains only `MARIDA.zip` (1,164,612,748 bytes).
- The archive contains 1,381 image patches, corresponding class and confidence masks, official train/validation/test lists, and shapefiles.
- MARIDA is weakly supervised satellite segmentation data. Class 1 is Marine Debris; zero means unlabeled. Its masks are not exhaustive object annotations.
- Python 3.12 is available. An NVIDIA RTX 4080 Laptop GPU has approximately 12 GB VRAM. Torch, Ultralytics, and rasterio are absent from the default Python environment.
- The requested FML repository demonstrates Ultralytics training with YOLOv8s on boat-mounted RGB camera images. It is a training reference, not additional satellite training data; use the requested YOLO11n instead.

## Proposed approach

Create an isolated Python 3.12 environment with CUDA-enabled PyTorch, Ultralytics, rasterio, and supporting image tools. Preserve the original archive.

Read the archive's patch metadata to confirm spectral band order and reflectance units. Render consistent RGB PNGs using Sentinel-2 red, green, and blue channels and a documented fixed reflectance scaling. Apply the identical rendering during inference. Do not fit preprocessing using validation/test data.

Convert connected class-1 mask regions to normalized YOLO boxes, keeping even small annotated debris components. Record component sizes and conversion statistics. Retain patches without class-1 annotations as background examples, while clearly recording that missing labels can make apparent negatives unreliable. Preserve official patch-level splits exactly and verify disjoint membership and complete image/mask matching.

Fine-tune pretrained `yolo11n.pt` for up to 100 epochs at 512-pixel input size, batch 16, seed 42, early-stopping patience 20, and GPU device 0. Use Windows-compatible data loading; reduce batch size if memory requires it and record changes. Select the best checkpoint on validation metrics only. Evaluate it once on the official held-out test split after training.

Deliver reproducible preparation/training/inference scripts, pinned installed dependencies, the dataset manifest, best and last checkpoints, training logs, test precision/recall/mAP, and example predictions. Report observed performance without assuming a minimum accuracy.

## Alternatives

1. **Recommended: YOLO11n detection with mask-derived boxes.** Meets the requested architecture and supports a small RGB detector. Boxes identify annotated debris regions rather than individual litter items.
2. **Multispectral semantic segmentation.** Better aligned with MARIDA's native labels and spectral information, but changes the requested model and requires handling unlabeled pixels in the loss.
3. **Train all 15 classes as detection categories.** Preserves class taxonomy, but several categories describe broad water conditions rather than discrete objects and distract from the immediate debris objective.

## Validation and limitations

Check finite image values, confirmed band order, legal normalized boxes, class mapping, split integrity, reproducibility, successful checkpoint reload, and a sample inference. Record archive SHA-256 and preparation settings.

Sparse masks mean detection scores are an approximation against converted annotations, not a standard exhaustively labeled detection benchmark. RGB conversion discards other spectral bands. Satellite imagery cannot support centimeter/millimeter size categories, microplastic counts, mass/concentration estimates, or species-health assessments from these labels. Predictions must be described as approximate debris-region detections.

## Sources

- https://github.com/glazzerini/fml
- https://github.com/marine-debris/marine-debris.github.io
- https://docs.ultralytics.com/models/yolo11/

## Status

Approved by the user on 2026-11-21. Execute satellite training only.
