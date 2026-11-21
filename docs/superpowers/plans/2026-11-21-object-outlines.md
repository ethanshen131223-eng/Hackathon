# Object outlines implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Draw around objects in cases and local photo tools, retaining outlines in saved findings.

**Architecture:** A shared SVG/Pointer Events controller handles gestures and drawing tools. A small pure geometry module validates normalized polygons, supports hit testing, and matches outlines to reference regions. Existing workbench and case state own their annotations.

**Tech Stack:** Vanilla JavaScript, SVG, Pointer Events, Node test runner, Happy DOM, Vite.

**Spec:** `docs/superpowers/specs/2026-11-21-object-outlines.md`

## Global constraints

- Keep point/checklist alternatives, old saved records, scientific limits, rewards, and reasoning flow.
- Store normalized coordinates; local photos remain local.
- No new dependencies or satellite changes.

## Review focus

- Touch/pen cancellation must not create partial annotations or scroll while drawing.
- Outlines must stay aligned after resizing; outside-image input stays bounded.
- Undo/clear must not leave hidden selected targets or erase point selections.
- Old circles and new polygons must survive save, reopen, and export.
- Broad whole-photo outlines and tiny taps must not count as reference-region matches.

## Tasks

- [x] Write failing geometry/storage tests; implement bounded polygons, matching, and backwards-compatible persistence.
- [x] Write failing pointer-controller DOM tests; implement draw/point, live preview, cancel, undo, clear, and cleanup.
- [x] Add case and editor flow coverage, wire shared controls into case/workbench/creator, and add matching styles.
- [x] Run complete frontend tests and production build, inspect integration and edge cases, and document verification limits.

## Execution ledger

- Existing click markers and forms remain the accessible fallback. The user's direct request supplies scope; routine implementation choices are made inline.
- Final review found creator testing used answer-key geometry instead of drawn strokes. A subsequent verified fix keeps strokes and point discoveries separate, renders unmatched strokes, and preserves point discoveries on undo/clear. Browser visual checks were stopped by the user; DOM and geometry checks pass.
