# Execution ledger — plan: 2026-11-21-map-feature.md

- User expanded scope with explicit SPI specification and NOAA, WoRMS, and Protected Planet sources. `2026-11-21-spi-map-design.md` records the final design.
- Ruling: Use direct Oceaneye areal observations rather than NOAA volumetric observations — compatible pieces/km² units are required; no depth is available to convert pieces/m³. This source covers a particle-size subset, not all litter.
- Ruling: Use a sample-supported sparse grid rather than color millions of unsampled tiles — unknown water must remain transparent. Point-to-cell values are model estimates, not direct whole-cell measurements.
- Ruling: Use Natural Earth 1:10 million cartography for land subtraction — manageable public-domain data; sub-kilometer coastal precision remains limited and is disclosed.
- Ruling: Use the public official UNEP-WCMC/IUCN polygon service for Protected Planet data — direct Protected Planet API v4 requires a token. Preserve attribution and exact layer release rather than guessing between conflicting root/layer release labels.
- Delegated independent source, taxonomy/protection, and grid work under dispatching-parallel-agents; root integrated UI.
- Built responsive frontend, SPI legend, controls, tile details, NOAA references, WoRMS search, and protection overlay. Local Vite5173/API8765 verified HTTP200.
- Python41 tests +5subtests and Node21 tests passed; production Vite build passed. Browser UI verification unavailable: CUA stopped because it could not determine Chrome's URL reliably. Live Google Maps requires the local API key.
- Fresh independent review in progress; correct important findings in one pass and rerun affected checks.
- Final review: fixed aggregated source URL arrays, normalized wrapped/world viewports with repeated map rendering, and launched protected queries independently of pollution fetches. Added regression tests; superseded requests cancel immediately and delayed responses cannot replace current data.
- Final: minor (deferred): alternate-dataset checkpoint resume requires explicitly re-supplying its data arguments to keep post-training evaluation metadata aligned.
- Final: minor (deferred): a post-training evaluation/copy failure needs manual recovery from retained run checkpoints; finished checkpoints are not resumable as active training jobs.
- Final verification after review fixes: 41 Python tests +5 subtests, 24 Node tests, and Vite production build passed. API restarted with latest-date selection and prepared-coast performance improvements; live endpoint reports 1,223 accepted records, 9 conservative coastline exclusions, and 1,222 selected sample records. Source snapshot retains all 1,232 records.
