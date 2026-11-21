# Identification and reasoning release

## Final experience

- The main workflow is identify → explain evidence → review/save. Real FML photos replace the initially proposed illustrations.
- Each mission draws a random annotated dataset photo. The catalog contains3,636 eligible photos; difficulty subsets favor visible reference regions. The daily puzzle stays fixed per local date. New source images are fetched through bounded archive ranges, with50 on-disk cached originals and8 in memory. Three credited static photos provide a clearly announced fallback.
- Cases show source attribution, CC BY4.0 license, image reference and annotation limitations. They do not infer physical sizes, polymer identities, concentrations, local animal presence or injury. Users' reasoning notes are saved, not semantically or scientifically graded by AI.
- Daily streaks, repeat-proof case rewards, local inventory, cosmetic purchases, manual image review and local puzzle creation are functional. Manual photo work is not falsely presented as automated recognition.
- Size Detective and Follow the Food Web were removed. The forced size-sorting phase was replaced with evidence/reasoning checks. SEA cleanup remains an optional secondary simulation.
- The field station and ocean map share navigation. Home uses blue/teal gradients and matching Manrope/DM Sans typography. Home's production JS is about22kB gzip; the larger deck.gl map is a separate entry.
- The map defaults to a smooth water-masked visual estimate. Survey tiles remain available. The visual model blends source values within75km using25km bandwidth, leaves unsupported/land pixels transparent, and clearly discloses unvalidated uncertainty. Source-supported grid calculations remain independent.

## Verification performed

- **76 Node tests passed**, including a DOM-integration test of case completion, structured reasoning, repeat rewards, daily claims, navigation, collection and cosmetic spending.
- **47 Python tests and5 subtests passed**, including source parsing, geospatial support, gradients, land transparency, date-line proximity and random case selection.
- Multi-page Vite production build passed. It emits both `index.html` and `map.html`; the map bundle retains the existing advisory about an uncompressed chunk exceeding500kB.
- Actual live API calls returned distinct random case IDs, a3,636-photo catalog and a797-photo beginner subset. A newly selected source image returned HTTP200 and decoded to1920×1080 pixels. Source annotation-file references remain attached.
- The final live regional smooth-layer request completed in approximately **0.45seconds**, with land and unsupported alpha preserved. Health requests are no longer blocked by gradient rendering.
- Both local frontend pages returned HTTP200.

## Limits

DOM integration is not a real browser or layout engine and does not verify actual WebGL rendering, typography/layout, IndexedDB implementation or browser image decoding. The previous computer-use attempt could not reliably determine Chrome's URL, so full browser visual verification was unavailable. Actual source images and the generated gradient artifact were inspected separately; API image decoding was verified with Pillow.

Natural-color Google Maps imagery still requires the user's local browser API key. Without it, the map explicitly shows a coordinate preview. No raw satellite boxes are converted into SPI density, and no additional recognition model was trained in this release.

Online multiplayer/chat remain deferred. Progress and user-authored work are local to the device/browser, with explicit session-only warnings if persistence fails. External source outages can require using the announced local photo cache.
