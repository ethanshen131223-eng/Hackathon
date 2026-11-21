# Conservation globe

Add a dedicated `/globe.html` explorer linked from the field station and ocean map. Users rotate a 3D Earth, zoom, choose geographic shortcuts, and browse marine/coastal protected-area polygons from the existing official UNEP-WCMC / Protected Planet service. No Google Maps key is required for the globe.

Use the installed deck.gl GlobeView with a local Natural Earth land-cover and relief texture, a quiet blue ocean surround, teal protected polygons, and coral selection. Keep Manrope/DM Sans typography. Desktop has a large globe beside a compact discovery rail; mobile stacks the globe, controls, and results. The globe is the main visual element; do not add decorative dashboard statistics.

Load bounded, generalized display geometry near the globe center after rotation settles. Show the searched geographic extent, partial-result limits, current layer citation/version, and request time. Regions without returned geometry must never be called unprotected. Results list and local name filter provide keyboard access; selecting a result highlights and centers it and exposes name, designation, source-reported status, realm, and its Protected Planet record. Show only supplied scientific fields. Boundaries are generalized display data, not navigation or evidence of enforcement or ecological condition. Include layer toggle, zoom, direction controls, reset, random region, and retry. Source or WebGL failures leave the region/result browser usable.

Region shortcuts name geographic waters, not invented protected sites. External source names and records are rendered as text. No fabricated conservation polygons, global coverage totals, AI recognition, or pollution estimates are introduced.

Subsequent steering: use the same natural land/ocean shading in the keyless ocean mapper, add country and broad water-body labels, and publish the website. Use Natural Earth public-domain imagery with saved provenance; the original NASA download host was unreachable. The hosted site includes 20 credited FML photos and 12 fixed-resolution source-supported pollution snapshots, explicitly labeled as an exported subset. Local Python retains the full dynamic service.
