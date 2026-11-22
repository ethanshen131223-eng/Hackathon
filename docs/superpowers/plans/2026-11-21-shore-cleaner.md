# Shore Cleaner implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline and request a final review.

**Goal:** Merge the supplied Shore Cleaner game into the arcade with a consistent UI and reliable lifecycle.

**Architecture:** Extract the reviewed game into a scoped engine. A Shadow DOM view owns game markup/theme, and a parent mount owns route navigation, reward display, and accessible lifecycle. A small persistence helper validates saved data.

**Tech Stack:** Existing vanilla JavaScript, Canvas 2D, Shadow DOM, Node tests, Happy DOM, Vite and Sites.

**Spec:** `docs/superpowers/specs/2026-11-21-shore-cleaner.md`

## Review focus

- Keyboard controls must not consume navigation or text/select input.
- Route exit must stop frames, timers, audio and event listeners.
- Existing parent CSS and wallet must not be overridden by imported selectors.
- New local progress must not issue unlimited shared rewards or break on corrupt storage.
- Optional controls must work without a multiplayer backend; failure to create Canvas must leave navigation usable.

## Tasks

- [x] Write failing persistence/lifecycle/integration tests.
- [x] Extract engine, add checkpoint/reward hooks, build a scoped themed view and wire the arcade route/navigation.
- [x] Run tests and production build; review and fix findings.
- [ ] Update hosted Site and Git repository.

## Subsequent steering

The user additionally requested richer protected-site information, smoother animations, global source-supported ocean coverage and finer fields, a combined map/globe switch, and a gradual blue-to-red palette. These changes are included. Gradient provenance and dataset-object labeling were explained during work. A failed test exposed source initialization resetting restored upgrades, and another exposed an undefined companion field blocking checkpoint writes; both were fixed and verified. View switching and date-line flight regressions were also fixed before publication. Full verification is in `reports/arcade_explorer_verification.md`.
