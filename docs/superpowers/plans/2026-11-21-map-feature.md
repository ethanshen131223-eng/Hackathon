# Detection Explorer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for local implementation alongside satellite training.

**Goal:** Random initial study area and toggleable detection heatmap on Google Maps, with a local key setting.

**Architecture:** Vite serves vanilla JS. deck.gl renders detections on Google Maps or a clearly labeled basemap-free preview. Python exports georeferenced model predictions to JSON.

**Tech Stack:** Vite, deck.gl, Google Maps JavaScript API, Python/rasterio/Ultralytics.

**Spec:** `docs/superpowers/specs/2026-11-21-map-feature-design.md`

## Global Constraints

- Local-only app with `.env.local` key configuration.
- Historical MARIDA/model data is separate from Google basemap imagery.
- Do not present confidence-weighted detection density as plastic concentration or a live risk assessment.

## Review Focus

No key, no detections, random selection with one area, heatmap off during navigation, and valid CRS conversion.

## Tasks

- [x] Add projection regression test, implement `export_map_data.py`, and export checkpoint detections after training. Raw detections stay separate from SPI.
- [x] Add Node tests for area choice, SPI classification, source handling, date-line bounds, and overlay state; implement pure helpers.
- [x] Build responsive map controls, Google/deck.gl integration, and key-free coordinate preview with scientific ocean-clipped SPI data, NOAA/WoRMS references, and Protected Planet context.
- [x] Run Python and Node tests and Vite production build. Browser smoke test was attempted but blocked by the computer-use URL-policy check; documented startup/key setup and verification limits.
