# MarineGUARDer satellite training results

**Trained and evaluated; not reliable for research use.** This is a weak experimental RGB detection baseline. It must not supply SPI trash-density estimates.

## Observed test performance

| Metric | Held-out test result |
| --- | ---: |
| Precision | 7.79% |
| Recall | 5.38% |
| mAP50 | 1.21% |
| mAP50?95 | 0.28% |

Evaluated once on the official 359-image test split, containing 223 mask-derived debris boxes. These are percentages, not fractions. Precision and recall use Ultralytics' curve-selected operating point; they do not describe deployment confidence 0.25. Sparse MARIDA labels do not establish exhaustive real-world detection accuracy.

## Training

- Model: pretrained YOLO11n, one output class (`marine_debris`, class 0).
- Completed: 100 epochs; maximum100, patience20, batch16, image size512, seed42, deterministic flag, RAM cache, Windows data-loader workers0.
- GPU: NVIDIA GeForce RTX 4080 Laptop GPU; CUDA 12.8.
- Python 3.12.10, torch 2.11.0+cu128, Ultralytics 8.4.216.
- Pipeline time: 29.6 minutes, including model download/training/evaluation through metric export.
- Best validation mAP50?95 recorded in CSV: 1.02% at epoch80. The test set did not choose the checkpoint.

| Split | Images | Images with annotated debris | Derived boxes |
| --- | ---: | ---: | ---: |
| train | 694 | 190 | 689 |
| val | 328 | 82 | 418 |
| test | 359 | 101 | 223 |

## Reproducibility and artifacts

- [Best inference checkpoint](../models/marineguarder_satellite_yolo11n.pt)
- [Final checkpoint](../models/marineguarder_satellite_last.pt)
- [Machine-readable metrics](training_metrics.json)
- [Training history](../runs/satellite_yolo11n/results.csv), [effective arguments](../runs/satellite_yolo11n/args.yaml)
- [Dataset manifest](../data/marida_yolo/manifest.json), [dependency lock](../requirements-lock.txt)
- Annotated examples: `reports/example_predictions/` (first8 test filenames; confidence0.25). The initial8 contain no above-threshold detections; these were not replaced with better-looking examples.
- CPU TIFF inference check: `reports/cpu_smoke/`.
- Georeferenced raw prediction export: `web/public/detections.json`. At confidence0.25, the complete test split produces one detected region. This file is separate from the scientific SPI data and is not displayed as a density estimate.

Archive SHA-256: `e19227596018348169b11a78d033890adb97d4b4f4c069f061cfcfab21d48d08`.

Selected checkpoint SHA-256: `3770c43e3972324c285f53101d87c4df2f8b96615f5f9f31dcdb6a0e9001765d`.

## Data adaptation and limits

MARIDA is weakly supervised pixel segmentation, not a fully annotated object-detection dataset. Every8-connected class1 region becomes a box, including one-pixel components. Unlabeled pixels are unknown; patches without labeled debris were retained as approximate backgrounds. RGB conversion discards8 of11 spectral bands.

Of223 test components,113 occupy one source pixel. This extreme small-object setting and the loss of spectral information plausibly contribute to the weak detection performance; that explanation is an inference, not a measured causal result. The training and validation component counts also include259 and149 singleton regions respectively. A native multispectral segmentation baseline would better match the dataset's task, but it was outside the requested YOLO11n training scope.

RGB TIFF bands4/3/2 use the published fixed0?0.1 reflectance stretch. Four patches contain visible no-data regions; their affected pixels are blanked to black and do not overlap any source annotation. Infrared gaps are recorded separately. Original patches and official splits are preserved.

Ten-meter satellite pixels cannot establish individual trash counts, millimeter/centimeter size categories, microplastic concentration, species presence, or health impacts. Do not convert boxes or confidence scores into pieces/km?. The independent SPI map uses published surface-density observations instead.

## Reference

[MARIDA official implementation](https://github.com/marine-debris/marine-debris.github.io), [MARIDA paper](https://doi.org/10.1371/journal.pone.0262247), and the requested [FML training reference](https://github.com/glazzerini/fml). Boat-camera FML images were not mixed into the satellite archive.
