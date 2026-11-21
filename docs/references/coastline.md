# Ocean tile coastline, area and observation support

The local API uses downloaded Natural Earth land polygons to remove land from
the observation-supported grid. It uses no Google imagery or scraped basemap
data. Google Maps is a separate frontend basemap.

## Coastline provenance

- Dataset: [Natural Earth 1:10m land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/),
  downloaded from its maintained repository at the pinned `v5.1.2` tag.
- File: `data_sources/coastline/ne_10m_land.geojson` (11 features, 6,837 polygon parts).
- Exact source URL, retrieval time, byte count and SHA-256 are recorded in
  `data_sources/coastline/provenance.json`.
- License: [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- Refresh/reproduce: `.venv/Scripts/python.exe scripts/fetch_coastline.py`.

**The “10m” name means 1:10,000,000 map scale, not 10-metre spatial accuracy.**
This is a cartographic coastline. It can omit small islands, fine coastlines,
tidal change, and narrow channels. Natural Earth specifically flags northern
Russia and southern Chile accuracy. The displayed clipping is exact relative
to these downloaded polygons, but it is not a survey of the present shoreline.
In particular, a 1 km² coastal cell may have substantial shoreline uncertainty.
Observed coordinates that fall on this land mask are excluded conservatively,
including possible coastal source/mask mismatches; health and tile metadata
report the exclusion count. The supplied 1,232-row source yields 1,223 accepted
observations and 9 excluded land-mask coordinates with this pinned coastline.

## Fixed grid and areas

The immutable base grid has 1,000 × 1,000 metre cells in an **ellipsoidal
equal-area** projection. EPSG:6933 covers latitudes −85° through +85°.
EPSG:6931 and EPSG:6932 cover the north and south polar caps. Domains are
clipped at their latitude boundaries, and the polar circular boundary has
5,760 segments. Edge cells can therefore have less than 1 km² before land
clipping. Squares in projected coordinates need not have equal geodesic side
lengths; their equal-area property supplies the specified square kilometres.

Area calculations use projected square metres in these WGS84 ellipsoidal
equal-area CRSs, never raw Web Mercator square metres or square degrees.
The independent test at 80°N checks a returned cell against an ellipsoidal
geodesic area calculation. The synthetic coast fixture checks exact areas:
one fully wet 1 km² cell at 100 pieces/km² and one half-wet cell at 400 yield
200 pieces/km² over their 1.5 km² supported water area.

Zoom resolution is fixed: zoom ≥13 uses 1 km² / 1 km sides; ≥11 uses 4 km² /
2 km sides; ≥8 uses 25 km² / 5 km sides; lower zoom uses 100 km² / 10 km sides.
All levels group the same 1 km base cells using their fixed projected indices.
The 2 km and 5 km grids do not form a hierarchy with each other. Both aggregate
the fixed base grid directly. Tile IDs remain stable within each resolution,
independent of viewport. Density thresholds are independent of viewport,
observed minimum, maximum, and zoom.

## Scientific meaning

Only nonnegative finite densities with coordinates, material scope, source
URL, and a measured/model source kind enter the grid. Repeated observation
IDs are discarded. No density is derived from YOLO boxes or marine debris
box area. Unknown water has no feature, including at world scale. A measured
zero is valid; absent measurements are never converted to zero.

Point and net-tow observations do **not** establish uniform spatial coverage.
The implementation assigns their reported density to a 1 km base-cell water
support as an explicit constant-cell **model estimate**. Within each base cell
and compatible material scope, only observations on the **latest available
UTC calendar date** are selected; ties on that day are averaged once. Older
observations remain visible in cells without newer observations. Undated or
unparseable-date records are used only when their cell has no dated records.
ISO dates and datetimes are accepted, with timezone-aware datetimes converted
to their UTC date before selection. Different `materialScope` strings are kept
in separate features and never averaged together. The supplied dataset yields
1,222 selected rows across 1,222 base cells from 1,223 accepted source rows.

For a coarser tile, let `A_i` be clipped water area and `d_i` the mean density
in each supported base cell. Returned density is `sum(d_i*A_i)/sum(A_i)`.
Unsupported base cells do not enter the mean or feature geometry. Thus the
returned GeoJSON can be a polygon with holes or disconnected multipolygon,
and an enclosing 10 km cell may render only a few 1 km cell water patches.

- `waterAreaKm2`: all clipped water in the enclosing current-resolution tile.
- `dataWaterAreaKm2`: union area of its model-supported 1 km cell water.
- `coverageFraction`: `dataWaterAreaKm2 / waterAreaKm2`. This is model support,
  **not the fraction physically surveyed**, nor a confidence score.
- `kind`: always `model`, because assignment from point samples to tile water
  is a spatial estimate. `sourceKind` retains `measured`, `model`, or `mixed`.
- `observationDates`: dates of the selected contributing samples. A coarser
  tile can contain differently dated base cells; old dates are retained only
  where those base cells have no newer samples. This does not imply a
  present-day measurement or temporal trend. `source` retains the dataset's
  complete historical coverage and limitations.
- `observationCount`: number of selected samples contributing to this tile.
  `availableObservationCount` also counts older compatible samples that were
  superseded within these base cells. Global `acceptedObservationCount`
  remains the source count after validation/land masking;
  `selectedObservationCount` reports the latest-date selection count.
- `selectionMethod`: explicit latest-date/tie/undated policy, returned on each
  feature and in response metadata.
- `uncertainty`: `null`. No total tile error, extrapolation uncertainty, or
  shoreline error has been established. Missing source uncertainty is not 0.
- `center`: geographic centroid of the enclosing projected square. It is for
  map/popup location, and need not itself be a sampled point or water.

Classification uses permanent absolute thresholds in pieces/km²:
`verylow` <50, `low` 50–<100, `medium` 100–<200, `high` 200–<600,
and `severe` ≥600. These are application categories, not a validated ecological
or human-health risk scale. Material cutoffs remain visible in `materialScope`.

## Local API contract

Run `.venv/Scripts/python.exe map_server.py` on `127.0.0.1:8765`.
The stdlib server imports no model/training code and does not use the GPU.
It rereads `data_sources/pollution_observations.json` when its mtime/size changes.
An absent dataset produces an empty response and `datasetAvailable:false`.
A missing coastline fails startup with a fetch instruction.

- `GET /api/health`: status, dataset availability, accepted/rejected counts,
  source and coastline provenance.
- `GET /api/areas`: `{areas, source}`; up to twelve 5° observation groups,
  preferring groups with observations ≥200 pieces/km². Each has `id`, coordinate
  `name`, `center:[lon,lat]`, `bounds:[west,south,east,north]`, `dates`,
  `observationCount`, and `maxDensityPiecesKm2`. These names are coordinate
  labels, not inferred authoritative place names.
- `GET /api/tiles?west=...&south=...&east=...&north=...&zoom=...`: GeoJSON
  FeatureCollection with `source` and `metadata`. Antimeridian viewports can
  use `west > east`; unwrapped longitude inputs are normalized, and spans of
  at least 360° cover all longitudes. Latitudes must satisfy −90 ≤ south < north
  ≤90. `zoom` must be finite and between 0 and 30.

Every feature has both top-level `id` and `properties.id`. Its properties are
`center`, `densityPiecesKm2`, `classification`, `waterAreaKm2`,
`dataWaterAreaKm2`, `coverageFraction`, `observationDates`, `observationCount`,
`availableObservationCount`, `selectionMethod`,
`baseCellCount`, `kind`, `sourceKind`, `source`, `materialScope`, `sourceUrl`,
`uncertainty`, `supportMethod`, `coverageMeaning`, `projection`, and
`resolutionKm2`. A tile with several source URLs returns a `sourceUrl` array.

Response `metadata` includes `resolutionKm2`, `cellSizeKm`, `maxFeatures`,
`availableFeatures`, `returnedFeatures`, `limited`, `baseResolutionKm2`,
`geometryCoverage:'observed-base-cell-water'`, area/aggregation/selection explanations,
provenance and observation counts. The default cap is 1,200 features per
viewport (`--max-features` overrides it). `availableFeatures` counts supported
coarse cells intersecting the viewport; `limited:true` reports truncation.
No full-world ocean grid is enumerated: work is bounded by observed cells.
Feature geometry and projected coast indices are cached within a dataset
version. CORS permits the loopback Vite dev/preview origins on ports 5173/4173.

## Implementation and checks

`ocean_grid.py` owns geometry, grid semantics and aggregation; `map_server.py`
owns hot reload and HTTP; `scripts/fetch_coastline.py` owns the pinned download.
Dependencies are Shapely ≥2.1 and pyproj ≥3.6, in addition to stdlib Python.
The existing `geo_runtime.py` selects a process-local bundled PROJ database
before pyproj import without changing machine/PostGIS configuration.

Run `.venv/Scripts/python.exe -m pytest tests/test_ocean_grid.py -q`.
Checks include hand-derived weighted means, land/hole clipping, real coastal
water, measured/model distinction, scope isolation, no-data transparency,
duplicates, zoom thresholds, feature caps, source-based area selection,
polar/datelined polygons, geodesic area, API validation, CORS and hot reload.
