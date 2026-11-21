# Guided Casework and Games Implementation Plan

> **For agentic workers:** Use executing-plans for root integration and dispatching-parallel-agents for independent content and progression modules.

**Goal:** Make guided pollution identification and rewarding learning games the app's main experience.

**Architecture:** New buildless-style Vite hub and modular vanilla-JS screens; preserve current map as second entry. Pure modules own educational cases and game progression; local persistence owns user work, never server uploads.

**Tech Stack:** Existing Vite/vanilla JS, native SVG/canvas and browser storage; existing Python map API untouched.

**Spec:** `docs/superpowers/specs/2026-11-21-casework-games-design.md`

## Constraints and review focus

No fake photo AI, no guessed physical sizes, no repeated reward farming, no silent image upload, no lost data on ordinary navigation, accessible scene alternatives, graceful storage failures, map entry preserved. User explicitly requests gradients and matching typography.

## Tasks

- [x] Progression module/tests: local wallet, daily streak/claims, one-time case rewards, inventory, cosmetics.
- [x] Content refined to real FML photos and original COCO regions, then randomized from3,636 eligible photos. Structured evidence checks and saved user reasoning replace unnecessary size sorting. Removed Size Detective and Follow the Food Web per user steering.
- [x] Root UI: gradient hub, identification/reasoning case flow, daily puzzle, collection/shop, manual photo workbench, local creator, persistence/export. Shared map navigation and water-masked smooth estimates added.
- [x] Final regression/build/API verification:76 Node tests;47 Python tests plus5 subtests; multi-page Vite build; actual random source photos, live gradient and both page routes. Report: `reports/casework_verification.md`. DOM integration covers completion, reasoning, duplicate rewards, daily cap and purchases; real browser visual verification remains unavailable.
