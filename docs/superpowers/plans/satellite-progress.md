# Execution ledger — plan: 2026-11-21-satellite-training.md

- Design approved by user. Executing directly in the existing workspace.
- Ruling: No git worktree or commits — this directory is not a git repository; keep all work in the user-provided workspace.
- Ruling: Use MARIDA's published QGIS RGB stretch (bands 4/3/2, reflectance 0–0.1) rather than estimating a stretch from images — consistent training and inference without test-data fitting.
- Task 1: in progress. Python 3.12 virtual environment created; CUDA PyTorch installation started.
- CUDA smoke test passed on RTX 4080 Laptop; six preprocessing tests now pass after a targeted regression test.
- Ruling: Nonfinite values in unused infrared bands do not invalidate RGB images — first affected patch has 356 infrared gaps with unlabeled pixels, but all visible bands are finite. Record all band gap counts; still reject nonfinite RGB. This keeps valid patches without inventing reflectance values.
- Preparation first attempt stopped at patch 205 due to overly broad finite-value validation. Preserve that partial output separately and rebuild the final dataset with the corrected validation.
- Ruling: Blank RGB no-data pixels to black using shared preprocessing and reject any no-data overlap with annotations — a validation patch has 41,968 no-data pixels, all unlabeled. Record no-data counts and preserve all patches. This introduces visible empty regions but does not fabricate observations.
- Ruling: Use rasterio's bundled PROJ database within Python processes — system PROJ_LIB points to incompatible PostGIS data. This fixes CRS conversion without changing machine settings. Projection regression tests verify known locations.
- Regenerate partial outputs with an explicit overwrite flag, then verify exact output membership before publishing the data manifest.
- Task 1: complete. Prepared 694 train / 328 validation / 359 test images; 689 / 418 / 223 mask-derived debris boxes. Four patches contain visible no-data, none overlapping labels. Original archive SHA-256 e19227596018348169b11a78d033890adb97d4b4f4c069f061cfcfab21d48d08.
- Task 2: training on GPU with approved 100-epoch maximum. Best selection uses validation; test evaluation has not yet occurred.
- Task 2: complete. Training process exited0 after100epochs and one test evaluation. Test precision7.79%, recall5.38%, mAP50 1.21%, mAP50–95 0.28%. Saved best/final5.50MB checkpoints and report. These scores are too weak for research use; SPI remains independent.
- Delivered checkpoint reloaded successfully for CPU TIFF inference using shared preprocessing. First8 test examples contain no detections at0.25. Full held-out prediction export yielded1above-threshold region, saved as georeferenced raw model output, never used as density.
- Independent review found no blockers for default training run. Alternate-dataset resume/report and finished-run recovery minor limitations are documented in `reports/map_verification.md`.
