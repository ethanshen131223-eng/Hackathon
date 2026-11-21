# Identification casework: real images and source evidence

## Photos and annotation answer keys

The active cases use **Floating Marine Litter (FML)** photos and the publishers' COCO garbage-region annotations. These are camera photographs, not generated illustrations or satellite detections.

- Dataset authors: **Guido Lazzerini, Fausto Ferreira, Alessandro Ridolfi**.
- [SEANOE dataset record and citation](https://doi.org/10.17882/106148).
- [Original project and description](https://github.com/glazzerini/fml).
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), as stated in the dataset record.
- Original archive: `https://www.seanoe.org/data/00950/106148/data/119295.zip`.
- COCO source files: `fml/labels/coco_format/train.json`, `val.json`, and `test.json`.

The local combined catalog contains **3,636 eligible photos** with 1?12 labeled regions. Each field-case visit draws a random image from a difficulty subset; minimum visible annotation areas make beginner cases easier to inspect. Recently drawn images are excluded where possible. The daily puzzle uses a deterministic date-based selection from the same catalog, so it stays stable throughout the local calendar day.

Photos are fetched on demand using bounded HTTP byte ranges supported by SEANOE. The complete 2.3 GB archive is not downloaded. Up to50 original photos are cached on disk and8 in server memory. Every downloaded photo is checked against the source annotation dimensions. No user-uploaded image is sent to this service.

Three unaltered example photos are included for an explicit offline cache: COCO test image19 (`image_20241006_082939_515090.jpg`), image64 (`frame_0879.png` in COCO, resolved by exact filename stem to the publisher's `frame_0879.jpg`), and image274 (`image_20241007_093909_596933.jpg`). Their original boxes are normalized from1920?1080 into interactive target regions. Source files and hashes appear in `fml-case-manifest.json`; the fallback source module is `web/src/dataset-cases.js`. The actual photos were inspected for consistency with those published regions.

The active UI displays author credit, license, source DOI, image filename, and the limits of the annotations. Exact capture date and geographic location are not independently supplied in the annotation metadata. Filename timestamps are not promoted into verified capture dates.

## What the labels mean

FML supplies a single class, **garbage**. The app calls these dataset-labeled litter regions. It does not infer polymer chemistry, exact material, physical dimensions, concentration, local wildlife, or actual injury from the label. A region can group multiple objects. The published annotations need not exhaust every visible item; unmarked areas are not treated as confirmed clean or natural.

Users identify source regions and then explain which claims the evidence supports. Structured questions distinguish supplied annotation locations from unknown physical size, polymer identity, and environmental density. Users' free-text reasoning is saved with the findings, **not automatically scientifically graded**. Optional photo review remains manual and stores its reasoning and uncertainty separately from dataset reference labels.

The earlier illustrative scenes remain as unused artwork in the source tree; they are not the active field cases. Size Detective and Follow the Food Web were removed at the user's request. There is no active food-web ordering or size-sorting minigame.

## Scientific context

[NOAA Marine Debris Program: Ingestion](https://marinedebris.noaa.gov/why-marine-debris-problem/ingestion) and [NOAA Ocean Service: Plastics in the Ocean](https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html) support the general ingestion/entanglement context. These mechanisms do not establish outcomes at a particular photographed location. No human-health diagnosis or unqualified microplastic biomagnification claim is made.

Only plastic smaller than5mm is described as microplastic. Additional size bins are local interface conventions, not an international classification standard. No case photo has a supplied physical scale, so its region size remains unknown. Optional manual size inputs represent users' measurements, not image-model estimates.

## Other data already in the project

The [ImaMPs record](https://zenodo.org/records/18027599) confirms that CLASE_0 contains3,000 negative microscope images and CLASE_1 contains3,000 positive images. Only CLASE_0.zip was supplied locally. A negative-only collection cannot train a valid two-class detector; no microplastic classifier or invented positive annotation is presented. The magnified-photo workbench is a manual review tool.
