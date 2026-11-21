# Surface particle observations used by MarineGUARDer

## Delivered snapshot

`data_sources/pollution_observations.json` contains **1,232 marine point records**, downloaded on **2026-11-21 at 21:18:27 UTC**, with individual sample dates from **2011-08-31 through 2025-10-24**. The source returned 1,424 points; 128 lake and 64 river points were excluded using the provider's region labels. All remaining marine records were retained, with no geographic downsampling, spatial interpolation, or invented values. The JSON records the original response and configuration SHA-256 digests.

This is the latest compatible snapshot returned by the selected provider at retrieval time. It is historical monitoring data; retrieval date does not become observation date. It does not establish the latest observation available anywhere in the scientific literature. Coverage is uneven, particularly concentrated in the Mediterranean and North Atlantic, with additional Arctic, Baltic, Indian, Pacific, South Atlantic, and Southeast Asian samples.

## Primary source and provenance

The [official Oceaneye mapping page](https://www.oceaneye.ch/en/cartographie/) embeds and links the CartONG/Lizmap project used for the download. Its [current map configuration](https://cartong.lizmap.com/websig/index.php/lizmap/service/getProjectConfig?repository=oceaneye&project=v_202412_projet_ocean_eye_BB) identifies the point layer `point_c_num` as **Number concentration [particles/km2]**, using EPSG:4326. The [public point-data export](https://cartong.lizmap.com/websig/index.php/lizmap/service?repository=oceaneye&project=v_202412_projet_ocean_eye_BB&SERVICE=WFS&REQUEST=GetFeature&VERSION=1.0.0&OUTPUTFORMAT=GeoJSON&SRSNAME=EPSG%3A4326&TYPENAME=point_c_num) supplies `trawl_num`, `date`, `region`, coordinates, and `c_tot_n_km2`. Each output record retains the trawl identifier and a link to its source feature.

[NOAA's partnership announcement](https://www.ncei.noaa.gov/news/new-oceaneye-partnership-brings-expansion-microplastics-database) independently identifies Oceaneye as a provider to the NOAA NCEI marine microplastics collection. The delivered observations come directly from Oceaneye's current export, rather than being represented as a NOAA-hosted subset.

## Units and material scope

`densityPiecesKm2` copies `c_tot_n_km2` unchanged: both particles and pieces denote counted particles per square kilometre. This is surface **micro- and mesoplastic concentration**, combining the provider's size classes above approximately 0.33 mm. It is not the density of all types and sizes of floating trash and cannot calibrate satellite boxes into item counts.

The [Oceaneye sampling and laboratory method, updated 2022-01-31](https://www.oceaneye.ch/wp-content/uploads/methodology_data_oceaneye_final.pdf), describes a 0.33 mm manta-net mesh and a 0.6 m by 0.15 m opening. The samples concern approximately the upper 15 cm. Visual identification, wind mixing, tow conditions, and changing methods affect comparability. The export does not provide per-row sampling conditions or uncertainty.

## Measured and model-assisted records

The [provider's harmonization report, updated 2022-02-04](https://www.oceaneye.ch/wp-content/uploads/interpolation_model_data_oceaneye.pdf), explains that samples from 2011–2014 had their microplastic fractions analyzed, while from 2015 onward its workflow estimates the 0.33–1.0 mm fraction from larger measured particles with an empirical model.

The point export lacks an explicit per-record model flag. MarineGUARDer therefore makes a **conservative inference from the sample year**: 161 records from 2011–2014 are labeled `kind: measured`; 1,071 later records are labeled `kind: model`, with `kindDetail` identifying model-assisted net-tow observations. `kindBasis` preserves this inference. These remain specific sampled locations and dates; they are not a continuous ocean simulation. No simulated observations are included.

The harmonization report's 28% average relative error for numerical concentration is an evaluation-set metric, not an individual confidence interval. Every observation has `uncertainty: null` because the export supplies no individual uncertainty. Null must be displayed as unavailable, never zero error or certain detection.

## Why the NOAA map was not converted

The [NOAA NCEI product page](https://www.ncei.noaa.gov/products/microplastics) links its current ArcGIS hub. That hub uses [Global Marine Microplastics Observations](https://noaa.maps.arcgis.com/home/item.html?id=1b56a456ad8c43889652e62aa25a317e), replacing the deprecated `Marine_Microplastics_WGS84` layer. Querying the current layer's distinct `Unit` values returned `pieces/m3`, `pieces kg-1 d.w.`, and `pieces/10 mins`. None is an areal particle concentration. A zero surface-sampling depth does not provide an integration thickness. Those values were not converted into pieces/km². Oceaneye's direct areal export avoids that unsupported conversion and includes observations dated in 2025.

## Refresh and display

Run from the repository root:

```powershell
.venv/Scripts/python.exe scripts/fetch_pollution_data.py
```

The script checks the provider layer's units and schema, validates individual dates, coordinates, densities, and unique trawls, then atomically replaces the JSON. Unknown region labels, malformed data, or failed requests stop the refresh without replacing a valid snapshot. It uses Python's standard library and does not change the training environment. More than 10,000 records requires an explicit documented sampling policy.

The live project name still includes `202412` and its capabilities abstract mentions 2011–2020, while the active layer group and returned records extend through 2025. Use individual dates and the retrieval metadata, rather than treating those old descriptive strings as current coverage.

Any downstream map tile is an aggregation of these dated samples, not an independently measured whole-tile value. Leave unsampled ocean cells unknown; never interpret an absent observation as clean water. Preserve material scope, date span, measured versus model-assisted distinction, and missing uncertainty in the UI.
