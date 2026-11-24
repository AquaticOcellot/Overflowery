# Changelog

## 0.2.0 — 2026-11-24

- Power shares instantly across connected cyan-root networks, filling consumer buffers first, then batteries, then generator buffers. Cyan roots continue to carry water at their existing level-based rates.
- Increased world chunks from 16×16 to 64×64 tiles.
- Field notes use level 5 flower icons and an “Unboosted harvests only” button toggle. Overgrowth levels 5+ display quality badges from Common through Transcendent.

- Designations can recruit nearby evacuating flowers instead of sending for distant idle replacements. Switching to a fill request releases the evacuation destination and preserves growth-cycle progress.

- Fixed distant flower recruitment stalling behind repeated per-tile discovery. Chunk searches are shared by species, candidate scans use finite snapshots, and existing/new reservations receive routes before further recruitment. Added a real-world-generation cross-layout regression.

- Rebuilt flower movement with unique plant IDs, exclusive destination reservations, inherited reservation precedence, cached terrain routes, and atomic cycle-gated swaps. Wrong-color flowers evacuate to reserved free soil; displacement creates fresh tile requests instead of return stacks. Planning, chunk discovery and movement transactions share frame budgets at every speed. Added controller-level convergence, cancellation, harvest protection, discovery and relocation tests.

- Square Network view toggle, colored root-type icon buttons for drawing/uprooting, and gated 10x/100x simulation speed controls with small simulation steps.

- Replaced wild flower species with blue, yellow, purple and red. Common Greenery is a separate universal inventory item. Added level 1–5 icons for flower overgrowth and quality tiers.

- Cyan water/power roots between heat and nutrient lanes, with independent channels, lossless water, 0.1%/s power loss, and manual repaint upgrades costing 1/2/4/8/16 Common flowers. No water gameplay mechanics yet.
- Replaced the global electric buffer with 10 kJ storage on each generator and added 100 kJ batteries; electricity travels through cyan roots and research spends actual stored power.

- Hide global moisture behind water generation; visible watering now falls with distance to actual water over 16 orthogonal tiles and drives growth, quality, terrain tint, tooltips and Field notes.

- Independent, seeded Perlin layers for elevation and moisture; water requires elevation below 20% and moisture above 50%. Dry lowlands remain land, shorelines use both conditions, and Field notes now includes 0–20% elevation.

- More readable terrain colors: green plains, brown highlands and pale peaks, with stronger moisture tinting and swamp-like reeds and shallow pool details on saturated land.

- Separate left-side Buildings menu with persistent placement and rotation controls; added the 1×1 small burner with 1 kW heat output, four input slots and 4 kJ heat storage.

- Common Greenery starting stock, energy-funded picking, Ash fertilizing unlocked by Rich Soil, and repeatable Selective Breeding research.
- Unfinished construction can be dismantled for half of its paid and buffered flowers as same-quality Greenery.

- Smaller wild patches (4–7 tile radii), no guaranteed starter flowers, and indefinite overgrowth: stage n takes n³ additional growth cycles and gives n² independent quality rolls. Partial harvests preserve remaining rolls when inventory fills, and Field notes counts growth duration once per crop.

- Wild flower patches appear about ten times less often and fade from dense centers to sparse edges.

- Unified interface typography and sentence-case labels, larger text, consistent top-right menu buttons, and a hidden Field notes scrollbar with a fading edge and contextual scroll cue.

- Independent, seed-derived quality niches peaking at 2x geometric promotion chance, random regrowth durations and per-harvest quality variation.
- Field notes heatmaps built only from picked results, with species/measurement selection, sample counts, quality breakdowns and unboosted filtering. Growth timing ends at ripeness and includes initial wild cycles using their starting progress. Square heatmap cells and icon buttons select flowers and measurements.
- Seed-derived hidden elevation-moisture growth niches peaking at 3x speed, with twice the previous average spread.
- Large burners place as blueprints requiring 10 Uncommon flowers and 10 seconds of material-funded construction, including partial deliveries and progress visuals.
- Large 3x2/2x3 rotating burner with full-footprint collision checks, multi-tile selection, placement previews and one shared 24 kJ heat reservoir accessible from all six tiles.
- Large burner consumes fuel at 2 kW and produces 3 kW heat with 150% efficiency, preserving fuel when storage is full.
- Downhill nutrient transport, uphill heat transport and soil moisture based on elevation, nearby water and seeded background dampness.
- Seeded expanding world centered on (0, 0), using 16x16 chunks, water below 20% elevation, rendering culling, retained exploration state and lazy offscreen regrowth.
- Universal right-click/Escape cancellation, persistent building placement mode and hold-and-drag harvesting and orthogonal root drawing/removal.
- Simplified, split top bar, data-only hover readouts, bottom action bar and a lower-right network-view toggle.
- Inventory always shows 32 slots in four columns, with no scrolling or instructional text, and supports drag-and-drop moves, merges and swaps.
- Burner and composter share the slot inventory system with four buffered input slots each.
- Roots grow through five levels based on actual resource movement, with increasing throughput and existing quality icons as level badges.

## 0.1.0 — 2026-11-19

- Flower harvesting, regrowth, quality tiers, inventory, fertilizer, and research.
- Separate burners, heat-powered generators, and composters.
- Orthogonal heat and nutrient root networks; each new link costs one Common flower.
- Joule-based fuel and electricity, 1 kW machines, and a shared 100 kJ electric buffer.
- Heat and nutrient growth bonuses, network overlay, and tile inspection.
- Optimized 64×64 flower assets and vector UI and machine icons.
- Automated tests and GitHub Pages deployment workflow.

Runs currently reset on refresh; save persistence is not implemented.
