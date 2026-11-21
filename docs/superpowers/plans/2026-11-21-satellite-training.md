# Satellite Training Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Approval of the training design authorizes execution.

**Goal:** Train and deliver an evaluated YOLO11n satellite debris detector.

**Architecture:** Convert MARIDA class-1 connected regions into one-class detection labels and render RGB from bands 4/3/2 using the official fixed 0–0.1 reflectance stretch. Preserve official splits, train a pretrained detector, select on validation only, then evaluate test once.

**Tech Stack:** Python 3.12, CUDA PyTorch, Ultralytics, rasterio, NumPy, OpenCV, pytest.

**Spec:** `docs/superpowers/specs/2026-11-21-satellite-training-design.md`

## Global Constraints

- Satellite model only; preserve source archive.
- YOLO11n; up to 100 epochs, batch 16, image size 512, seed 42, patience 20, device 0.
- Retain every annotated debris component and every supplied patch.
- Treat weak annotations and RGB-only information as explicit limitations.

## Review Focus

Wrong RGB order/scaling, singleton and border boxes, split leakage, incomplete archive pairs, and preprocessing inconsistency between training and inference. Cover conversion with controlled fixtures and dataset-level integrity assertions; confirm actual checkpoint reload and inference after training.

## Task 1: Prepare reproducible training data

Files: `satellite_data.py`, `prepare_satellite.py`, `tests/test_satellite_data.py`, `requirements*.txt`, `.gitignore`.

- [x] Install dependencies in `.venv`; confirm CUDA with a real tensor operation.
- [x] Write conversion tests first and observe failure for missing implementation.
- [x] Implement `render_rgb(bands)` and `debris_boxes(mask)` and archive preparation with disjoint, complete official splits.
- [x] Run pytest, inspect actual TIFF metadata, prepare all 1,381 patches, and verify summary/manifest. Visually inspect the generated training batch image; numeric RGB and box tests passed.

## Task 2: Train and evaluate

Files: `train_satellite.py`, `predict_satellite.py`, `runs/satellite_yolo11n/*`, `models/*`, `reports/*`.

- [x] Train with the approved defaults and record installed versions, hardware, parameters, data hash, and logs.
- [x] Select best checkpoint using validation only; evaluate on the test split once and save metrics.
- [x] Reload the delivered checkpoint and run example predictions; use the same RGB function for TIFF inference. CPU TIFF inference succeeded; georeferenced export completed.
- [x] Write `README.md` and `reports/training_report.md` with observed results, usage, and limitations.
- [x] Review implementation and verify tests, checkpoint artifacts, and reported metrics.
