# MarineGUARDer SPI map

This supersedes the earlier detection-density map design, following the user's detailed SPI specification and source additions.

## Requirements and implementation

- Local Google Maps JavaScript API hybrid basemap preserves natural geographic land colors; ignored `web/.env.local` supplies the browser key. No key produces a clearly labeled coordinate preview.
- SPI thresholds are fixed across zooms: Severe ≥600 red; High 200–<600 orange; Medium 100–<200 yellow; Low 50–<100 green; Very Low 0–<50 blue pieces/km². Legend remains visible when the overlay is off.
- Equal-area grid encloses nominal 1, 4, 25, or 100 km² at zoom levels ≥13, ≥11, ≥8, and below 8. Projected land subtraction produces water polygons, including polygon holes. Surface-density estimates are supported only in observed 1 km² base cells; coarser grids retain those water geometries rather than coloring unsampled intervening water. Weight densities by their supported water areas.
- Use the latest dated samples in each base cell and material scope, averaging same-date ties. Retain older data where newer local observations are absent. Surface dates remain explicit, never replaced by retrieval dates.
- Oceaneye is the primary compatible density source: 1,232 marine net-tow records through 2025-10-24, above approximately 0.33 mm. No volumetric-to-areal conversion or YOLO item-count conversion. Published harmonization methods require a conservative model-assisted designation for records from 2015 onward; individual uncertainties are unavailable.
- No observations means transparent water. No simulated values are used. Point-to-cell extrapolation is labeled model-based, with original measured/model-assisted kinds and support fractions preserved.
- Click polygons for SPI, source density, location, dates, water area, model-support area, uncertainty availability, and source links. Render sparse supported geometry and cap large responses, with partial-response notices.
- Random startup selects an actual observation area for review. It does not assert a live environmental-risk ranking.
- NOAA species pages provide four initial range/habitat references. WoRMS resolves accepted taxonomy and supports live scientific/common-name search. Range overlap is not a local sighting.
- Official UNEP-WCMC/IUCN marine/coastal protected polygons are queried by viewport and linked to Protected Planet, with current returned attribution/release and a 200-feature cap. Do not conflate OECMs or proposed designations with confirmed protected status.

## Tradeoffs and limits

Native Google heatmaps were retired in 2026. deck.gl GeoJSON polygons, rather than blurred points, keep SPI colors within the chosen water mask. Natural Earth 1:10 million land polygons are public-domain, small enough for local use, and support holes/islands, but do not guarantee sub-kilometer shoreline or tidal accuracy. State this in the interface.

Oceaneye measures a particle-size subset, not all floating trash. One-kilometer model-support cells are not actual net-tow survey footprints. Historical, sparse estimates cannot establish present-day pollution in every ocean tile. A richer source may be added later without inventing current values.

Keep this map local. Retain YOLO training independently; do not delay or interrupt training for map inference. Games and microscope models remain deferred.

## Verification

Use Python tests for equal-area/polar geometry, land subtraction, coastline exclusions, date selection, weighted aggregation, scope isolation, no-data semantics, and API responses. Use Node tests for SPI boundaries, toggle independence, random area choice, accepted taxon resolution, and protected query filtering/date-line behavior. Build the frontend and verify HTTP/API endpoints.

Native browser verification was blocked when the computer-use tool could not determine Chrome's current URL. Do not claim visual/browser QA passed. Google rendering also requires the user's local key.
