# MarineGUARDer

Local pollution-identification casework, a sourced ocean map, and the existing experimental YOLO11n satellite baseline. Casework emphasizes identification and reasoning. Online multiplayer and additional recognition models remain deferred.

## Identification and reasoning

The home page at **http://127.0.0.1:5173** is the field station. Open a case to draw a random real photo from the CC BY 4.0 [Floating Marine Litter dataset](https://doi.org/10.17882/106148). The local catalog contains 3,636 photos with 1–12 published litter regions. Difficulty filters favor visible annotation sizes and 1–3, 4–6, or 7–12 regions. A photo is downloaded on demand using bounded archive ranges; the complete 2.3 GB archive is not downloaded. Three credited photos provide a clearly labeled offline fallback.

Users identify the published regions, explain which claims the evidence supports, record an observation/reasoning note, and save the findings. A region can contain several items; annotations do not establish exact item count, polymer identity, physical size, environmental concentration, animal presence, or actual injury. Free-text reasoning is stored locally, not automatically scientifically graded.

The daily puzzle selects a stable photo for the local calendar day. First claim earns10 sand dollars, rising5 per consecutive day to a100 cap; same-day replays do not pay twice. A previously unseen photo case earns20. The collection keeps findings, source references, and reasoning; earned points can buy cosmetic color themes. Sand dollars have no monetary value.

Photo review supports surface or magnified JPEG/PNG/WebP images, manual findings, optional supplied measurements, and JSON export. User photos and authored puzzles remain in browser IndexedDB, with a visible temporary-session fallback if persistent storage is blocked. They are not uploaded to the server or sent to an AI service. The puzzle creator has a local answer key and test mode. The optional SEA cleanup is a simulation; type SEA outside a text field or open it under Play. Size Detective and Follow the Food Web were removed to keep the focus on observation and reasoning.

The map at **http://127.0.0.1:5173/map.html** shares navigation with the rest of the app. Its default gradient is a water-masked, Gaussian visual interpolation of scientific source values, limited to75km from samples with25km bandwidth. This is explicitly an unvalidated model view, not measured coverage. It fades outside source support; land and unsupported water remain transparent. Click for source dates and the exact estimated class, or choose **Source-supported survey tiles** to inspect the original sparse support.

Data and photo attribution details: [case sources](docs/references/learning-sources.md). Pure logic and DOM-integration tests cover case completion, reasoning, duplicate rewards, daily streaks, storage, and purchases. DOM tests do not verify actual browser image decoding, graphics, or layout.

## Open the map

For a fresh machine that only needs the map, use the lightweight environment:

```powershell
uv venv --python 3.12 .venv-map
uv pip install --python .venv-map/Scripts/python.exe -r requirements-map.txt
.venv-map/Scripts/python.exe map_server.py
```

No CUDA, model weights, or MARIDA archive are required to run the map. Source snapshots and coastline data are already supplied.

The map needs a local Python API and the frontend server. From the workspace root, run these in separate PowerShell terminals:

```powershell
.venv/Scripts/python.exe map_server.py
```

```powershell
cd web
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. For natural-color Google Maps imagery, copy `web/.env.example` to `web/.env.local`, set `VITE_GOOGLE_MAPS_API_KEY`, and restart the frontend. Enable Maps JavaScript API in your Google Cloud project; restrict the browser key to your local app's HTTP referrers. Google may require billing. The key is intentionally browser-visible. Do not commit `.env.local`.

After initial setup, `./run_map.ps1` starts both services from one terminal when their ports are free, preferring `.venv-map` when it exists. It stops its own API when the frontend exits. If a local preview is already running, use that preview rather than start a second copy.

Without a key, a labeled coordinate-only preview still supports panning, zooming, and data layers. It does not claim to show Google Maps imagery.

The app starts at a random area with supported observations. SPI can be toggled independently of protected-area boundaries. Click a water tile for density, class, actual water area, model-support area, dates, missing uncertainty, and source. The permanent legend uses the requested fixed thresholds: blue <50, green 50–<100, yellow 100–<200, orange 200–<600, red ≥600 pieces/km².

Grid size is 1 km² at zoom ≥13, 4 km² at ≥11, 25 km² at ≥8, and 100 km² below 8. The backend uses equal-area projections, subtracts Natural Earth land polygons, selects the latest dated samples within each base cell and particle scope, and aggregates supported base-cell water areas. Unknown water remains transparent. Sparse rendering and bounded output avoid generating a worldwide grid containing millions of unknown cells.

**Data limitations:** Oceaneye provides 1,232 dated marine observations through 2025-10-24, covering surface micro- and mesoplastics above approximately 0.33 mm. This is not all-size floating trash. A point supports a modeled 1 km² water cell; it does not establish actual survey coverage over that cell. Some source records are model-assisted, inferred from the provider's published year-dependent methodology. Individual uncertainties are unavailable. Natural Earth 1:10 million coastlines omit some small islands and narrow features; do not use this prototype for navigation or precise protected-boundary enforcement.

NOAA supplies four initial species range/habitat references; WoRMS supplies accepted taxonomy and live common/scientific-name search. Range summaries do not establish local sightings. The protected-area switch queries official UNEP-WCMC / IUCN marine polygons linked to Protected Planet, retains release attribution, and warns when its 200-polygon response is incomplete.

Refresh sources and verify:

```powershell
.venv/Scripts/python.exe scripts/fetch_pollution_data.py
.venv/Scripts/python.exe scripts/fetch_coastline.py
.venv/Scripts/python.exe sync_species.py
.venv/Scripts/python.exe -m pytest -q
cd web
npm test
npm run build
```

Source provenance and methodology: [pollution observations](docs/references/pollution-sources.md), [coastline and grid](docs/references/coastline.md), [NOAA and WoRMS](docs/references/species-sources.md), [protected areas](docs/references/protected-areas.md).

The map uses scientific density observations independently of the satellite detector. YOLO boxes are never converted into SPI pieces/km².

## Setup (Windows PowerShell)

Python 3.12 and a CUDA-capable NVIDIA GPU are used for training. `uv` is installed on this machine.

```powershell
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe torch==2.11.0 torchvision==0.26.0 --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/python.exe -m pytest -q
```

`requirements-lock.txt` records every installed dependency, including the `+cu128` torch builds. For an exact fresh environment, install that file with the CUDA index available:

```powershell
uv pip install --python .venv/Scripts/python.exe -r requirements-lock.txt --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match
```

## Prepare and train

The prepared dataset already exists after this run. Preparation intentionally requires an empty destination to avoid stale images or labels. To reproduce, use a new output folder and pass its YAML path to training:

```powershell
.venv/Scripts/python.exe prepare_satellite.py --archive MARIDA.zip --output data/marida_reproduction
.venv/Scripts/python.exe -u train_satellite.py --data data/marida_reproduction/data.yaml --name satellite_reproduction
```

Training defaults: pretrained `yolo11n.pt`, 100 epochs maximum, early-stopping patience 20, batch 16, image size 512, seed 42, CUDA device 0, zero data-loader workers for Windows, and validation-based checkpoint selection. Test evaluation runs once after training, followed by sample inference from the delivered weights. `cache=ram` speeds data loading; strict bitwise determinism is not guaranteed with this setting or across hardware.

To resume an interrupted training run before test evaluation:

```powershell
.venv/Scripts/python.exe -u train_satellite.py --resume runs/satellite_yolo11n/weights/last.pt
```

## Use the trained checkpoint

```powershell
.venv/Scripts/python.exe predict_satellite.py data/marida_yolo/images/test/S2_12-12-20_16PCC_0.png
# Or use an original 11-band MARIDA reflectance TIFF; preprocessing is shared:
.venv/Scripts/python.exe predict_satellite.py path/to/S2_patch.tif --device 0
```

Inference defaults to CPU and confidence 0.25. It writes an annotated image and JSON boxes under `reports/predictions`. PNG inputs must use the same fixed RGB rendering as the training data. TIFF inputs must be MARIDA-format 11-band reflectance arrays; arbitrary satellite products require their own preprocessing and validation. TIFF output boxes remain in local image pixel coordinates.

Artifacts:

- `models/marineguarder_satellite_yolo11n.pt`: selected checkpoint for inference.
- `models/marineguarder_satellite_last.pt`: final training checkpoint.
- `models/preprocessing.json`: rendering and label conversion settings.
- `data/marida_yolo/manifest.json`: archive SHA-256, exact split membership, TIFF metadata, infrared gap counts, and component sizes.
- `runs/satellite_yolo11n/`: training CSV, curves, arguments, checkpoints, and held-out test plots.
- `reports/training_metrics.json`: hardware, versions, and held-out test metrics.
- `reports/example_predictions/`: annotated examples at confidence 0.25.
- `reports/training_report.md`: observed results and limitations.

## What the model estimates

Class `0` is `marine_debris`. Every 8-connected region of MARIDA class `1` becomes a box, including one-pixel regions. Supplied train/validation/test lists remain unchanged. All patches are retained, including those without annotated debris.

MARIDA is **weakly annotated segmentation data**: unlabeled pixels are unknown, and visible features may lack labels. Consequently, background images may contain unannotated debris, and box evaluation may penalize correct detections or reward annotation-specific behavior. These metrics measure agreement with the converted annotations, not established real-world accuracy.

RGB uses TIFF bands 4, 3, and 2, clipped from reflectance 0–0.1 to 8-bit values using MARIDA's official QGIS rendering. Other spectral channels are discarded. Infrared gaps are recorded but do not affect RGB. Nonfinite visible pixels are consistently blanked to black; preparation rejects gaps overlapping annotations. Four patches have visible-band gaps, all unlabeled. Python processes use Rasterio's bundled PROJ database to avoid this machine's incompatible PostGIS environment setting.

The supplied images use approximately 10-meter pixels. Boxes represent approximate debris regions. They cannot measure individual trash items, centimeter/millimeter size categories, microplastic counts, mass, concentration, or health effects. Do not interpret number of boxes as number of litter items or box area as physical plastic coverage.

## References

- [MARIDA official code and class/band mappings](https://github.com/marine-debris/marine-debris.github.io).
- Kikaki K, Kakogeorgiou I, Mikeli P, Raitsos DE, Karantzalos K (2022), [MARIDA: A benchmark for Marine Debris detection from Sentinel-2 remote sensing data](https://doi.org/10.1371/journal.pone.0262247). Dataset: [Zenodo](https://doi.org/10.5281/zenodo.5151941), CC BY 4.0.
- [FML repository requested by the user](https://github.com/glazzerini/fml): its Ultralytics training interface is the reference; its boat-camera images are not mixed into satellite data. Upstream reference files are saved in `docs/references/`.
- [Ultralytics YOLO11](https://docs.ultralytics.com/models/yolo11/). Review Ultralytics' AGPL-3.0/enterprise licensing before distributing a larger application.
