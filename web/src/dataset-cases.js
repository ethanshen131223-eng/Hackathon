// Real FML photos and published COCO regions. Generated from docs/references/fml-case-manifest.json.
export const DATASET_CASES = [
  {
    "id": "fml-19",
    "title": "At the harbor wall",
    "location": "FML field photo ? precise location not provided",
    "mode": "surface",
    "difficulty": "Beginner",
    "duration": "2 min",
    "label": "Open-dataset photo case",
    "sourceType": "dataset",
    "source": {
      "name": "Floating Marine Litter (FML)",
      "url": "https://doi.org/10.17882/106148",
      "license": "CC BY 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
      "attribution": "Guido Lazzerini, Fausto Ferreira and Alessandro Ridolfi ? Floating Marine Litter (FML), SEANOE, DOI 10.17882/106148. Photo reproduced without alteration; published boxes adapted into game targets.",
      "imageId": 19,
      "imageFile": "image_20241006_082939_515090.jpg",
      "archiveMember": "fml/images/test/image_20241006_082939_515090.jpg",
      "annotations": "fml/labels/coco_format/test.json",
      "capturedAt": null,
      "retrievedAt": "2026-11-21",
      "imageSha256": "a6dfa224f0c0f189ec084312f86f2815df5e7b97b4041f9c09ed052a1558e7c3"
    },
    "intro": "Inspect a real water-surface camera image from FML. Find its 3 published litter regions, then decide which details the evidence can support. This is annotation practice, not a complete pollution survey.",
    "sceneUrl": "/scenes/fml-19.jpg",
    "objectives": [
      "Find 3 dataset-labeled litter regions.",
      "Keep size unknown when no scale is provided.",
      "Distinguish a labeled region from an individual trash count."
    ],
    "targets": [
      {
        "id": "fml-19-78",
        "x": 0.509375,
        "y": 0.27578125,
        "radius": 0.069921875,
        "bbox": [
          0.439453125,
          0.23046874999999997,
          0.13984375,
          0.090625
        ],
        "clue": "Object region 51% across and 28% down",
        "label": "Dataset-labeled litter region 1",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 78,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-19-79",
        "x": 0.21171875,
        "y": 0.27421875,
        "radius": 0.06171875,
        "bbox": [
          0.15000000000000002,
          0.229296875,
          0.1234375,
          0.08984375
        ],
        "clue": "Object region 21% across and 27% down",
        "label": "Dataset-labeled litter region 2",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 79,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-19-80",
        "x": 0.8109375,
        "y": 0.25546875,
        "radius": 0.098828125,
        "bbox": [
          0.7121093749999999,
          0.201953125,
          0.19765625,
          0.10703125
        ],
        "clue": "Object region 81% across and 26% down",
        "label": "Dataset-labeled litter region 3",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 80,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      }
    ],
    "distractors": [],
    "species": [],
    "impact": "Floating debris can present ingestion and entanglement hazards. NOAA describes these mechanisms generally; this image and its annotations do not establish animal presence or actual injury.",
    "sourceUrls": [
      "https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html",
      "https://marinedebris.noaa.gov/why-marine-debris-problem/ingestion"
    ]
  },
  {
    "id": "fml-64",
    "title": "Close to the surface",
    "location": "FML field photo ? precise location not provided",
    "mode": "surface",
    "difficulty": "Explorer",
    "duration": "3 min",
    "label": "Open-dataset photo case",
    "sourceType": "dataset",
    "source": {
      "name": "Floating Marine Litter (FML)",
      "url": "https://doi.org/10.17882/106148",
      "license": "CC BY 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
      "attribution": "Guido Lazzerini, Fausto Ferreira and Alessandro Ridolfi ? Floating Marine Litter (FML), SEANOE, DOI 10.17882/106148. Photo reproduced without alteration; published boxes adapted into game targets.",
      "imageId": 64,
      "imageFile": "frame_0879.png",
      "archiveMember": "fml/images/test/frame_0879.jpg",
      "annotations": "fml/labels/coco_format/test.json",
      "capturedAt": null,
      "retrievedAt": "2026-11-21",
      "imageSha256": "3db67b9385557425e4222c227cb17a207257e7d1ce5f8680bf33c39fd6433e92"
    },
    "intro": "Inspect a real water-surface camera image from FML. Find its 4 published litter regions, then decide which details the evidence can support. This is annotation practice, not a complete pollution survey.",
    "sceneUrl": "/scenes/fml-64.jpg",
    "objectives": [
      "Find 4 dataset-labeled litter regions.",
      "Keep size unknown when no scale is provided.",
      "Distinguish a labeled region from an individual trash count."
    ],
    "targets": [
      {
        "id": "fml-64-185",
        "x": 0.209896,
        "y": 0.715741,
        "radius": 0.2564815,
        "bbox": [
          0.005208500000000005,
          0.4592595,
          0.409375,
          0.512963
        ],
        "clue": "Object region 21% across and 72% down",
        "label": "Dataset-labeled litter region 1",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 185,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-64-186",
        "x": 0.411198,
        "y": 0.371759,
        "radius": 0.058073,
        "bbox": [
          0.353125,
          0.321296,
          0.116146,
          0.100926
        ],
        "clue": "Object region 41% across and 37% down",
        "label": "Dataset-labeled litter region 2",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 186,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-64-187",
        "x": 0.29375,
        "y": 0.407407,
        "radius": 0.065625,
        "bbox": [
          0.22812500000000002,
          0.34722200000000003,
          0.13125,
          0.12037000000000002
        ],
        "clue": "Object region 29% across and 41% down",
        "label": "Dataset-labeled litter region 3",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 187,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-64-188",
        "x": 0.209635,
        "y": 0.391204,
        "radius": 0.0421295,
        "bbox": [
          0.176562,
          0.3490745,
          0.066146,
          0.084259
        ],
        "clue": "Object region 21% across and 39% down",
        "label": "Dataset-labeled litter region 4",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 188,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      }
    ],
    "distractors": [],
    "species": [],
    "impact": "Floating debris can present ingestion and entanglement hazards. NOAA describes these mechanisms generally; this image and its annotations do not establish animal presence or actual injury.",
    "sourceUrls": [
      "https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html",
      "https://marinedebris.noaa.gov/why-marine-debris-problem/ingestion"
    ]
  },
  {
    "id": "fml-274",
    "title": "Reflections on the water",
    "location": "FML field photo ? precise location not provided",
    "mode": "surface",
    "difficulty": "Beginner",
    "duration": "2 min",
    "label": "Open-dataset photo case",
    "sourceType": "dataset",
    "source": {
      "name": "Floating Marine Litter (FML)",
      "url": "https://doi.org/10.17882/106148",
      "license": "CC BY 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
      "attribution": "Guido Lazzerini, Fausto Ferreira and Alessandro Ridolfi ? Floating Marine Litter (FML), SEANOE, DOI 10.17882/106148. Photo reproduced without alteration; published boxes adapted into game targets.",
      "imageId": 274,
      "imageFile": "image_20241007_093909_596933.jpg",
      "archiveMember": "fml/images/test/image_20241007_093909_596933.jpg",
      "annotations": "fml/labels/coco_format/test.json",
      "capturedAt": null,
      "retrievedAt": "2026-11-21",
      "imageSha256": "5d897936cddbf6492f9e062a221d71dd97c4db593eecd1a65d1820bc8ad4bcb5"
    },
    "intro": "Inspect a real water-surface camera image from FML. Find its 2 published litter regions, then decide which details the evidence can support. This is annotation practice, not a complete pollution survey.",
    "sceneUrl": "/scenes/fml-274.jpg",
    "objectives": [
      "Find 2 dataset-labeled litter regions.",
      "Keep size unknown when no scale is provided.",
      "Distinguish a labeled region from an individual trash count."
    ],
    "targets": [
      {
        "id": "fml-274-844",
        "x": 0.05390625,
        "y": 0.24375,
        "radius": 0.052734375,
        "bbox": [
          0.0011718750000000028,
          0.2140625,
          0.10546875,
          0.059375
        ],
        "clue": "Object region 5% across and 24% down",
        "label": "Dataset-labeled litter region 1",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 844,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      },
      {
        "id": "fml-274-845",
        "x": 0.25390625,
        "y": 0.1734375,
        "radius": 0.0671875,
        "bbox": [
          0.18671875,
          0.132421875,
          0.134375,
          0.08203125
        ],
        "clue": "Object region 25% across and 17% down",
        "label": "Dataset-labeled litter region 2",
        "category": "unknown",
        "material": "Not specified by dataset",
        "measuredMm": null,
        "sizeBasis": "No physical scale supplied",
        "quantity": 1,
        "unit": "annotated region",
        "annotationId": 845,
        "explanation": "The published FML annotation marks this region as garbage. A region may contain more than one item. Material, physical size, and trash concentration are not supplied by this label."
      }
    ],
    "distractors": [],
    "species": [],
    "impact": "Floating debris can present ingestion and entanglement hazards. NOAA describes these mechanisms generally; this image and its annotations do not establish animal presence or actual injury.",
    "sourceUrls": [
      "https://oceanservice.noaa.gov/hazards/marinedebris/plastics-in-the-ocean.html",
      "https://marinedebris.noaa.gov/why-marine-debris-problem/ingestion"
    ]
  }
];
