# Detection explorer

User requested a map that starts at a random at-risk area and supports a heatmap toggle, then chose a local Google Maps key setting. Implement alongside the authorized satellite training.

Build a small local Vite/vanilla-JavaScript map under `web/`. Use Google Maps as the basemap when `VITE_GOOGLE_MAPS_API_KEY` is set in `web/.env.local`. Use deck.gl HeatmapLayer and GoogleMapsOverlay because Google's native heatmap layer was retired in May 2026. With no key, offer a clearly labeled coordinate-only preview using deck.gl; never imply it is Google Maps.

The initial area is chosen uniformly at random among MARIDA study areas with model detections. A “Random area” control selects another area when possible. An accessible checkbox switch controls heatmap visibility without changing map location; individual detection markers remain available. Filters adjust minimum confidence and heat radius. Show source dates, detection counts, and limitations.

Export georeferenced detections from the selected satellite checkpoint and the test-image TIFF transforms in the data manifest. Transform box centers from source CRS to WGS84; use confidence as a visual weight. Regions are historical study locations, not a live risk ranking. Google supplies basemap data, not pollution observations. No automatic scraping or model inference on Google imagery.

Visual direction: ocean-blue canvas, white left-side observation panel, teal controls, amber-to-red detection heat. A compact MarineGUARDer wordmark and open map dominate; no unrelated dashboard features. Use a clean readable system sans serif, 16px body text, restrained panel borders, keyboard focus, responsive stacked layout.

```text
MarineGUARDer                      Satellite explorer
Location + historical data |                                  |
Random area               |             Map                  |
Heatmap on/off            |                                  |
Confidence + radius       |                         Legend   |
Source and limitations    |                                  |
```

Alternative: native Google heatmap is unavailable; a separate OpenStreetMap basemap would not satisfy the Google Maps request. Keep this feature local as requested; no publication.

Verify region selection and heatmap state logic using Node tests; verify CRS projection using Python tests; build with Vite; inspect both no-key startup and the switch in a browser. Live Google rendering requires the user's configured key, so report that verification limit honestly.
