# MarineGUARDer map verification

Local preview: http://127.0.0.1:5173. Python API: http://127.0.0.1:8765.

## Verified behavior

- 41 Python tests and 5 subtests pass. Coverage includes density parsing, source exclusions, fixed SPI thresholds, equal-area and polar geometry, land subtraction, polygon holes, dateline behavior, latest-date selection, particle-scope isolation, water-weighted aggregation, missing-data semantics, and HTTP API behavior.
- 24 Node tests pass. Coverage includes random-area selection, all SPI boundaries, independent layer visibility, source-link arrays, unwrapped/world viewports, concurrent source requests, accepted and synonym taxonomy, common names, missing responses, protected-area filtering and truncation.
- Vite production build passes. The principal map bundle is approximately 253 kB gzip and triggers Vite's advisory about an uncompressed chunk over 500 kB. It contains deck.gl; no build errors.
- Local frontend and health/area endpoints return HTTP 200. Queries at zooms 7, 9, 11, and 13 return 100, 25, 4, and 1 km² grid metadata respectively, with georeferenced water polygons and source properties.
- The lightweight `.venv-map` initializes the map API with Shapely and pyproj; PyTorch is absent. Satellite training dependencies are not needed to run the map.
- Independent review found and fixed combined source-link arrays, wrapped preview bounds, and protection requests waiting for pollution queries. New regression tests pass.

## Sources and limits

Oceaneye snapshot: 1,232 marine point records through 2025-10-24; 9 fall on generalized Natural Earth land and are conservatively excluded from display. Latest-date selection retains 1,222 records in supported base cells. These are surface micro/mesoplastic observations, not all-size trash or a complete ocean census. Source rows after 2014 are conservatively marked model-assisted based on the provider's published workflow, rather than a per-row flag. Individual uncertainty values remain unavailable.

Tile values are model-based local-support estimates. Supported-cell water area is not the physical net-tow sample area. Unsampled water remains transparent, and coarse aggregation never fills gaps between supported cells. Coastlines are cartographic and do not guarantee one-kilometer shoreline accuracy or tidal boundaries.

NOAA supplies four initial linked habitat/range summaries; they do not prove local sightings. WoRMS accepted names and sample live searches were verified against its REST service. Protected boundaries come from the official UNEP-WCMC/IUCN public service and preserve its live layer attribution/release. The layer and service root report different monthly release labels; the app displays the layer's label without claiming to resolve that discrepancy.

## Verification unavailable

No Google Maps API key has been configured. Live natural-color Google rendering is implemented but unverified. The no-key mode is labeled a coordinate preview.

Computer-use verification stopped when its policy mechanism could not confidently determine Chrome's current URL. No browser automation workaround was used. Consequently visual layout, WebGL rendering, keyboard interaction, and full browser integration were not verified through the UI; build, module, source-service, and HTTP/API checks passed.

## Deferred minor resilience issues

- Resuming a training checkpoint made with a nondefault dataset requires re-supplying matching data arguments for post-training evaluation/reporting.
- If evaluation or copying fails after training finishes, recover manually from retained run checkpoints; Ultralytics does not resume already completed training checkpoints as active jobs.

Neither affects the current default training run or the independent SPI map.
