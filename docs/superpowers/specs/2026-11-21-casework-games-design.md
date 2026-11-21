# MarineGUARDer guided casework and games

## Final user steering (supersedes earlier illustrative/game proposals below)

The active experience prioritizes **identification and reasoning** with real open-dataset photographs. Every case mission draws a random eligible FML image from the3,636-photo catalog, with published COCO regions as reference labels. The daily image is fixed per local date. All photos retain CC BY4.0 attribution; unmarked regions are not asserted clean or natural. No polymer, size or concentration is guessed.

After identifying regions, the user explains which claims the evidence supports, identifies information that still needs measurement, and records a short reasoning note. Notes are stored with findings and not automatically graded. The unnecessary forced size-sorting step is removed. **Size Detective and Follow the Food Web are removed entirely.** Casework, daily spotting, manual review, local puzzle creation, collection and sand-dollar progression remain. SEA cleanup is an optional secondary simulation.

The home UI uses the requested blue-to-teal gradients and matched Manrope/DM Sans typography. The map is linked through the same navigation. Its default is a smooth, water-masked visual estimate, with an explicit75km support radius and no validated uncertainty; original survey tiles remain available. Unknown water stays transparent. Technical interpolation details belong in source docs, while the UI distinguishes an estimate from a measurement.

The remainder of this file records the initial proposal, not a statement that the removed games or authored illustrations are active.

## Authorized direction

User asked to implement non-satellite features, make the app easier to use, emphasize case-by-case identification games, selected **spot and classify pollution**, and requested gradients and matching typography. Existing local Vite app and ocean map remain the platform. No new satellite recognition work.

## Experience

Home becomes a welcoming field-station hub with an illustrated ocean scene, one primary action to start a case, daily challenge, progress, and clear navigation: Field cases, Daily puzzle, Play, Collection, and Ocean map. Preserve the existing map as `/map.html`; it returns to the hub via its brand link.

Three authored illustrated training cases teach visible surface debris, an estuary cleanup, and a magnified sample. Users inspect a scene, mark possible pollution, classify findings, reveal explanations, and finish a case into a local inventory. Every training scene is explicitly an illustration with authored answers, not a scientific observation. Real uploaded photos support manual annotation and review; no fake AI output is generated.

Photo workbench provides surface and magnified modes, local image upload, mark/select suspected regions, debris category, optional measured size, quantity, notes, and report export. Categories disambiguate original touching boundaries: microplastic <5mm; small 5–<10mm; medium10–<50mm; large50–100mm; >100mm oversized/other. Size remains unknown without a supplied measurement or valid calibration. A photo alone cannot establish polymer identity, concentration, or ecological injury. CLASE_0.zip contains3000 negative microscope images but no positive class; it cannot alone train a valid binary classifier.

Daily puzzle uses a date-selected authored scene. Mark suspect debris using pointer or equivalent keyboard-accessible item controls, receive constructive feedback, and claim a streak reward once per local calendar date. Sand-dollar reward starts10 and increases5 per consecutive day, capped100. Gaps reset streak; same-day replays cannot issue a second reward. Local storage is device/browser-specific and has a graceful in-memory fallback.

Play includes debris-size identification, a trophic-transfer ordering game, and a cleanup clicker unlocked by typing SEA or a visible accessible alternative. Learn that prey-to-predator transfer is different from assuming biomagnification. Games give bounded local rewards; no real currency or cleanup claims. A puzzle creator lets users mark targets on a local image, test their authored puzzle, and keep it locally. Do not silently upload images.

Collection lists case findings, case history, badges, and cosmetic upgrades purchased with earned sand dollars. Award case rewards once per authored case. Store user annotations as manual and illustrated answers as training observations. Include a usable shop, not fake purchases. Prioritize solo play; online multiplayer/chat remain deferred as in the original brief.

## Design

Palette: deep ocean #12384d, blue #246cda, turquoise #17b5b0, coral #ff976e, pale sky #edf7fc, white #ffffff. Hero combines blue-to-teal gradients, layered native SVG water shapes, and visual clues from the case scenes. Cards have distinct illustrations; gradients support hierarchy rather than covering every panel. Manrope headings and DM Sans body unify the existing brand. Body16px, restrained data labels14px, generous spacing, visible focus, no hover-only interactions, reduced-motion support.

```
MarineGUARDer   Cases  Daily puzzle  Play  Collection  Map    sand dollars
Find what doesn't belong.              Illustrated ocean / case clues
Start a field case                      Progress / streak
Today's puzzle | Field cases with scene previews | Your next learning step
```

## Source accuracy

NOAA Marine Debris Program sources support ingestion and entanglement explanations. WoRMS/NOAA species and Protected Planet remain on the map. Avoid medical claims and unqualified microplastic biomagnification claims. Educational scenarios are authored demonstrations; uploaded work stays manual. Do not use the unreliable satellite model to invent photo results.

## Validation

Test date streak boundaries, duplicate rewards, wallet spending/ownership, corrupted storage, item-size boundary classification, scene hit testing, and puzzle scoring. Validate keyboard alternatives, view switching, case completion, user puzzle persistence/export, mobile layout by available tools. Existing map modules/tests and API must continue to work. Production build includes both hub and map. Browser verification may be limited by the existing computer-use URL-check failure; report limits honestly.
