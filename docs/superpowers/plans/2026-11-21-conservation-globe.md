# Conservation globe implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; request a final code review.

**Goal:** Explore real marine/coastal protected areas on an interactive globe.

**Architecture:** Reuse `queryProtectedAreas` with optional bounded generalization. Isolate pure globe state/extent helpers and deck.gl layers from the accessible explorer DOM/controller. Vite builds a third page.

**Tech Stack:** Existing vanilla JS, deck.gl GlobeView/BitmapLayer/GeoJsonLayer, SVG controls, Vite, Happy DOM.

**Spec:** `docs/superpowers/specs/2026-11-21-conservation-globe.md`

## Global constraints

- No Google key for globe, no invented protected geometry, preserve ocean-map queries.
- Keep live citation, unknown states, bounded records, and accessible result list.
- Use local natural-color Natural Earth imagery with provenance; keep existing typography.

## Review focus

- Date-line and polar extents stay valid; camera moves do not fire unlimited requests.
- Aborted/late requests cannot replace the current region's results.
- Source errors and WebGL failures keep recovery controls usable.
- List selection, layer toggle, name filtering, and keyboard controls agree with the globe state.
- Attribution, generalized boundary limitations, and partial results remain visible.

## Tasks

- [x] Add failing tests for geographic bounds, source query options, and globe layers; implement data/state layer and local texture.
- [x] Add failing DOM flow tests; implement globe renderer, region/results/details UI, navigation and responsive styles.
- [x] Run full frontend suite and production build; smoke-test the live service, review and fix findings, document visual-check limits.

## Ledger

- Existing module version supports experimental GlobeView; cap zoom at 6 to keep this a regional overview. Use existing deck.gl dependencies.
- Browser automation was explicitly stopped in the prior turn; do not resume native computer control during this task. Verify through meaningful DOM/layer tests and source smoke tests; report remaining visual QA.
- User added mapped land/ocean imagery, consistent shading, named places, and publication. Extended the same basemap/labels to the keyless mapper and prepared 20 cached case photos plus 12 exported pollution snapshots for static hosting. Source-provided dates and limitations stay visible. Natural Earth replaces the unreachable NASA image host.
- Review found a focused result button was replaced on selection; a failing focus regression test was added, then focus preservation implemented. All 99 frontend tests pass after the fix. Live protected-area query succeeded with a source release and explicit partial-result status.
