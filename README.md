# Overflowery

Small PixiJS + TypeScript flower-gathering prototype.

Current release: **0.2.0**. The in-game version and browser title read the version from `package.json` without a `v` prefix. See `CHANGELOG.md` for release notes.

## Publish on GitHub Pages

The game is a static site; no application server or database is required. The included `.github/workflows/deploy-pages.yml` installs dependencies, tests, builds, and deploys `dist` whenever `main` is pushed. Vite uses relative asset URLs so a repository name such as `Overflowery` needs no additional base-path configuration.

1. Create an empty public GitHub repository (for example `Overflowery`). Do not initialize it with a README if uploading this folder using the commands below.
2. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. From a PowerShell terminal in this project, initialize and push the source. Replace `YOUR_USERNAME` and, if different, the repository name:

   ```powershell
   git init -b main
   git add .
   git commit -m "Release 0.2.0"
   git remote add origin https://github.com/YOUR_USERNAME/Overflowery.git
   git push -u origin main
   git tag -a 0.2.0 -m "Overflowery 0.2.0"
   git push origin 0.2.0
   ```

4. Open the repository's **Actions** tab and wait for **Deploy game to GitHub Pages** to succeed. The deployment output and **Settings → Pages** show the live URL, normally `https://YOUR_USERNAME.github.io/Overflowery/`.
5. Future pushes to `main` deploy automatically after tests and the build succeed. If Pages was enabled after the first push, run the workflow manually through **Actions → Deploy game to GitHub Pages → Run workflow**.

Git authentication may open a browser sign-in. The workflow uses GitHub's built-in deployment token; no personal access token or custom repository secret is required. Commit the source, workflow, graphics, and lockfile; `.gitignore` excludes `node_modules`, the package store, and `dist`. The workflow publishes only the built `dist` directory.

Local development uses Node.js 24 and pnpm 12.21.0. If Node is managed by fnm and a terminal cannot find `node`, activate it before running pnpm:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use default
pnpm dev
```

To inspect a production build locally, run `pnpm build`, then `pnpm preview` and open the printed URL. Changes to `package.json`'s version update the game label; create a matching Git tag for each release. Players' progress currently resets on refresh.

Official references: [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Vite static deployment](https://vite.dev/guide/static-deploy).

`src/main.ts` wires together the game modules in `src/game`, `src/input`, `src/rendering` and `src/ui`; styles live in `src/style.css`. The world has four flower species: blue, yellow, purple and red. Common Greenery is a separate inventory item. Level 1–5 flower and Greenery icons are used for growth stages and quality tiers; quality badges remain separate. The source art is kept in `graphics/sprites`. Vite bundles imported assets and checks that referenced files exist during `pnpm build`.

```sh
pnpm install --store-dir .pnpm-store
pnpm dev
```

Use WASD to explore and click mature flowers to harvest them. A new run starts with 100 Common Greenery, which can be used as any Common flower item. At 100% soil efficiency, unheated and unfed flowers regrow in 12 seconds. Inventory has 32 slots in four columns, with empty slots always displayed. The panel contains only icons, quality badges, and stack counts; it fits the viewport without scrolling. Items stack by item type and quality, up to 100 per stack. When all slots are occupied, matching items can still fill existing stacks; harvests that need another slot remain uncollected. Nominal base pickup odds are 90% Common, 9% Uncommon, 0.9% Rare. Each species has a separate seed-derived quality sweet spot in elevation–watering space, multiplying the promotion chance by up to 2: at the peak this becomes 80% Common, 16% Uncommon, 3.2% Rare, and so on. Promotion chance varies ±10% per harvest, with a fresh quality roll. The final tier absorbs the remaining tail; total probability always equals 100%. Each regrowth cycle independently takes 85–115% of its otherwise expected time.

## World generation

The starting tile at the center of the view is **(0, 0)**. Coordinates extend east/west and north/south; negative coordinates are fully supported. The world uses **64×64-tile chunks**, generated as the viewport approaches them with a one-chunk margin. Moving, zooming out, or resizing the view loads the necessary chunks. There are no fixed map edges.

Terrain shading and irregular flower patches are deterministic for a given seed (`defaultWorldSeed` in `src/world.ts`) and independent of exploration order. A small building clearing remains near the origin; all four flower species appear in wild patches with no guaranteed starter flowers. Chunks provide reusable tile data for future terrain and biome mechanics.

Tiles below **20% elevation** and above **50% moisture** are water, with deeper blue shading at lower elevations, ripple marks, and shoreline edges. Water has no grass or flowers, and machines require dry ground. The starting clearing is raised above water level. Hover a tile to inspect its terrain and elevation. Roots can still span any orthogonally adjacent tiles, including water.

Elevation and a hidden global moisture field use independently seeded Perlin noise. Global moisture is used only to generate water; it is not shown on tiles and does not directly affect flowers or terrain tint. The visible **watering** level depends on the nearest actual water tile: 100% on water, 93.75% on adjacent land, falling by 6.25 percentage points per orthogonal step to 0% at 16 tiles. The padded lookup works across chunk boundaries without generating neighboring chunks or depending on exploration order. Watering drives flower growth and quality preferences, soil shading, swamp details, hover readouts and Field notes. Terrain colors still snap to the nearest 10%; gameplay uses the exact level.

Each species has a hidden sweet spot in **elevation–watering space**, with its center and tolerance widths generated deterministically from the world seed. Changing the seed changes the species' niches; revisiting or generating chunks in another order does not. Optima stay above water level, with independently seeded watering preferences. Widths vary by species and axis, normalized to an average of 23 percentage points—twice the previous average width. The environmental growth multiplier is a smooth two-dimensional Gaussian bonus: **3× at the sweet spot**, gradually approaching **1×** farther away. There is no abrupt zone boundary or unsuitable-soil penalty. Exact preferences, tolerance widths, and multipliers are not displayed in the player UI.

The environmental multiplier applies consistently to normal growth, heat/nutrient growth gains, and offscreen catch-up. It stacks with existing heat and nutrient bonuses. Without supplies, a flower at its sweet spot regrows in 4 seconds instead of the normal 12. Consumption is still capped at 100 W of heat and one nutrient/s per growing flower. Watering remains a terrain property rather than a consumable.
Distant terrain and flower sprites are removed from rendering. Generated chunks, flower growth/fertilizer state, machines, and root networks stay in memory for the current run; returning does not regenerate or reset them. Unheated offscreen flowers catch up on normal growth when revisited, while offscreen factories and resource-fed flowers continue simulating. Refresh still resets the run; disk saves are not implemented.

## Machines and energy

Place machines on empty tiles, then click them to inspect their operation. Burners and composters have four input slots, each holding a stack of up to 100 flowers. Opening one shows its input grid beside your bag. Drag stacks from the bag into the buffer; the machine takes one flower at a time, from left to right, and automatically starts another when processing finishes. Queued flowers can be dragged back into the bag. Active flowers finish processing even if the buffer is emptied. The 1×1 harvester consumes 1 kJ per harvest roll from its connected power network and stores ripe flowers from a 5×5 area, with the four corners omitted, in its own 12-slot output inventory. Drag output stacks to your bag to collect them.

Buildings use explicit footprints. The **large burner occupies 3×2 tiles**, or **2×3 when rotated**; the **battery occupies 2×1 tiles**, or **1×2 when rotated**. Small burners, generators, composters and harvesters occupy 1×1 tiles. While placing, press **R** or click the rotation button to turn the preview by 90°. The hovered tile is the footprint's upper-left anchor. The green/red preview checks the complete footprint: every tile must be land, free of flowers, and unoccupied. Rotation works across chunk boundaries and negative coordinates. Clicking any covered tile opens the same machine; burners and composters process from their four-slot buffers. Placement mode stays active after building.

All six burner tiles share one **24 kJ heat reservoir** (4 kJ per covered tile). Heat roots can connect at any of its occupied tiles. Existing heat under a new building is preserved without duplication. Internal roots between two tiles of the same machine do not transport heat or earn root experience. The burner consumes fuel at **2 kW** and outputs **3 kW heat** (150% efficiency). A Common 2 kJ flower lasts one second and yields 3 kJ heat; higher-quality fuel lasts proportionally longer.

Placing a large burner creates a **blueprint** that reserves its footprint. Click it and drag **10 Uncommon-or-better flowers** into the four construction slots. Each flower funds one second of work and is consumed when that second begins. Construction starts immediately with partial deliveries: four flowers allow **four seconds / 40%** progress, then it pauses until more arrive. With all materials available, construction takes **10 working seconds**. Waiting for materials does not bank work time. The map blueprint shows construction percentage, and its panel shows material and work totals.

Construction slots accept only Uncommon or better flowers, and deliveries are capped at the remaining requirement; excess stays in the source inventory. Unused queued materials can be retrieved. Construction materials are separate from fuel and never burn for heat or ash. The shared heat reservoir activates only on completion, when the same building becomes operational and its panel switches to the normal fuel buffer. Other buildings take one second to construct. Unfinished sites can be dismantled for half of their spent and buffered flowers, rounded down per quality and returned as Greenery of the same quality; the refund requires inventory space.

Drag between slots to rearrange stacks, merge matching items and quality up to 100, or swap different stacks. Shift-click or Shift-drag transfers stacks between the bag and a selected container when accepted. Ctrl-click transfers the clicked stack and its matches to the other container; Ctrl-click empty space empties that slot's container into the other one. Merge overflow stays in the source slot. Empty slots retain their positions; new harvested stacks use the first empty slot. Dropping outside a slot or pressing Escape cancels the move. The same drag controls work with mouse or touch.

**Right-click** or **Escape** universally cancels the current action: stops harvesting/root strokes and inventory dragging, clears the root anchor and machine selection, closes open panels, and returns to Harvest mode. Cancelling a drag leaves items in their original slots. Machine processing continues, and completed construction or transfers are not undone.

- **Small burner:** costs 10 Common flowers, occupies one tile, and has a four-slot input buffer and 4 kJ heat storage. Consumes flower fuel at 1 kW and produces 1 kW of heat at 100% efficiency; a Common flower lasts two seconds. Produces one ash per flower.
- **Large burner:** consumes flower fuel at 2 kW to produce 3 kW heat (150% efficiency) in its shared 3×2 footprint reservoir. Common flowers contain 2 kJ; fuel energy doubles each quality tier. Produces one ash per fully consumed flower. Pauses without wasting fuel when its 24 kJ heat storage is full. Burners do not produce electricity.
- **Generator:** costs 10 Common flowers and occupies one tile. It consumes heat delivered through heat roots, converting it 1:1 into electricity at up to 1 kW. It has no flower input and stores up to 10 kJ locally, stopping conversion when full.
- **Battery:** costs 10 Common flowers and occupies 2×1 tiles. It stores up to 100 kJ of electricity carried through connected cyan roots.
- **Composter:** costs 10 Common flowers and occupies one tile. It consumes a flower to produce 8 nutrients at 2 nutrients per second. All qualities give the same nutrient yield. Its tile stores 20 nutrients; production pauses without wasting the remaining input when full. Composters produce neither heat nor electricity nor ash.

Use **Research** to spend stored electricity on upgrades. **Area Tools** costs 100 kJ and unlocks drag-area picking. **Rich Soil** costs 16 kJ and unlocks ash fertilizing. **Selective Breeding** starts at 20 kJ and adds one percentage point to base improved-quality odds per purchase; each repeat purchase costs 1.5× more. Use **Fertilize** to spend ash on improved quality odds. Fertilizer level n costs n³ ash. Energy is stored in Joules and shown in J or kJ.

## Root networks

Select **Roots**, choose the **Heat**, **Water/power** or **Nutrient** icon, then click neighboring tile centers or hold the left mouse button and drag to draw a route. Fast strokes fill intervening links; diagonal motion forms orthogonal staircases. **Uproot** supports the same dragging interaction. Links work under any tile, including machines and flowers. Only north/south/east/west connections are allowed. In **Harvest** mode, hold and drag across flowers to harvest mature blooms along the stroke. Releasing the mouse, leaving the map, changing tools, Escape, or losing window focus stops the stroke.

Each new link costs **one Common flower item** from inventory; higher qualities are never spent on root links. Repainting existing heat or nutrient links does not charge again. Repainting cyan water/power links upgrades them for the cost below. All three networks can occupy the same tile pair and stay independent. **Uproot** removes only the selected network's link with no refund. Escape, right-click, or clicking the starting tile cancels the current route.

| Network | Link transfer limit | Tile storage | Loss |
| --- | --- | --- | --- |
| Heat (orange) | 50 W at level 1 → 2.5 kW at level 5 | 4 kJ | About 2% per second |
| Water/power (cyan, middle lane) | Network-wide power; 0.2 → 10 water/s | 4 kJ consumer buffers; 10 kJ generator buffers; 100 kJ batteries; 20 water | 0.1% power/s on connected roots; water lossless |
| Nutrient (green) | 0.2/s at level 1 → 10/s at level 5 | 20 nutrients | None |

Heat and nutrient links grow independently through five levels as resources actually cross them. Cyan links only upgrade through repainting. Both directions count; idle time, heat loss, and simply storing resources do not. The limits below apply at the largest possible difference in storage fill levels:

| Level | Heat transfer limit | Total heat moved to reach level | Nutrient transfer limit | Total nutrients moved to reach level |
| --- | --- | --- | --- | --- |
| 1 | 50 W | 0 J | 0.2/s | 0 |
| 2 | 150 W | 250 J | 0.6/s | 1 |
| 3 | 400 W | 2 kJ | 1.6/s | 8 |
| 4 | 1 kW | 8 kJ | 4/s | 32 |
| 5 | 2.5 kW | 24 kJ | 10/s | 96 |

Roots thicken and display the existing quality icons for levels 1–5: Common, Uncommon, Rare, Epic, Legendary. Hover a link or its badge to inspect its level, transfer limit, and remaining resource movement until its next level. Level-ups also trigger a notice. Reconnecting an existing link preserves progress; uprooting and rebuilding starts at level 1. Levels do not decay, but reset on refresh with the rest of the run. Higher root throughput does not increase a generator's 1 kW output cap.

Flow depends on the difference in tile storage fill levels. Connect burner tiles to generator tiles for electricity; branch heat roots toward flowers to accelerate growth. Connect composter tiles to flowers using nutrient roots.

Elevation also biases flow: **nutrients favor downhill routes; heat favors uphill routes**. The transport potential is storage fill fraction plus four times elevation for nutrients, or minus four times elevation for heat. Equal-fill tiles therefore send nutrients downhill and heat uphill. Sufficient storage pressure can overcome an opposing slope. Actual flow remains capped by each root's level, available source resources, and destination space; only resources actually moved earn root experience. Tile storage and ambient heat loss are unchanged.

Growing flowers consume up to 100 W of heat and 1 nutrient/s. Either resource alone can double normal growth speed; both can reach 3× speed (4 seconds per regrowth at 100% soil efficiency with continuous supply). Overgrown flowers continue consuming supplied heat and nutrients. Without supplies, flowers keep growing at their normal rate.

**Network view** displays heat as orange tile shading, nutrients as green dots, stored electricity as cyan bars and stored water as cyan dots. Hover a tile to inspect resources and growth. Networks, machines, and inventory reset on refresh. Simulation code is in `src/roots.ts` and `src/energy.ts`; run `pnpm test` for placement, construction cost, transport, processing, growth, and buffer checks.

### Harvest observations

Open **Field notes** in the top bar to see empirical elevation–watering heatmaps for each flower. Use the flower icon buttons and measurement buttons to choose the observed percentage of Uncommon-or-better flowers or mean regrowth time. Square cells cover 10 percentage points on each axis, display sample counts, and stay blank until observed. Selecting a cell shows its full observed quality distribution. No hidden environmental optima or theoretical curves are revealed.

Only successful picks enter the journal. Regrowth timing starts after a pick and ends when the flower ripens, so waiting to harvest does not inflate the measured time. The first wild harvest also contributes growth duration, including the simulated age represented by its initial growth progress. Already-ripe flowers start with a completed initial cycle. **Unboosted harvests only** excludes cycles that used heat or nutrients and harvests affected by fertilizer or selective breeding. Results and journal data reset on refresh with the rest of the run.

### Overgrowth

Wild patches have 4–7 tile radii, dense centers and sparse edges, with no guaranteed starter patches. The central 3x3 building clearing remains.

Flowers continue growing after maturity. Completing stage n takes n³ additional base growth cycles and its total harvest yield is n² independently rolled flowers. For a nominal 12-second base cycle:

| Stage | Additional time | Total elapsed time | Harvest rolls |
| --- | --- | --- | --- |
| 1 | 12 seconds | 12 seconds | 1 |
| 2 | 96 seconds | 108 seconds | 4 |
| 3 | 324 seconds | 432 seconds | 9 |
| 4 | 768 seconds | 1200 seconds | 16 |

Environmental speed, the cycle's random duration, heat and nutrients affect overgrowth too. Hover a mature flower for its stage, harvest rolls and progress toward the next stage. Flowers use level 1 art at initial growth, then switch to the matching level icon as they overgrow. Levels 5 and above add a quality badge: Common at level 5, Uncommon at 6, continuing through Transcendent at 14; later levels keep the Transcendent badge. Higher stages also appear larger. Holding harvest still picks flowers as soon as they mature.

Each roll produces one flower with independent quality. When inventory fills during a harvest, the remaining rolled items stay on that flower; growth pauses until they are collected. Picking the complete crop resets growth. Field notes records each collected quality roll, but only one base maturity duration per growth cycle, so overgrowth yield does not duplicate growth-time samples.

### Flower area markers

Select **Flower area**, choose a flower icon, and drag a rectangle to paint colored tile markers. Water and buildings are skipped; each drag supports up to 4096 tiles. **Clear selected area** removes markers only inside the dragged rectangle. Marked tiles remain unavailable for buildings.

Each unsatisfied tile reserves a nearby matching flower, with unique plant IDs breaking distance ties. Additional chunks are searched incrementally when necessary, with searches shared across tiles requesting the same species. Existing reservations receive routes before further recruitment, and new fillers begin routing immediately. Flowers on the wrong color reserve nearby free soil that is unmarked or marked for their species. Evacuations finish at their reserved free tile, rather than stopping midway. An unsatisfied designation can recruit an evacuating flower directly: its free-soil reservation is released and its current movement-cycle progress is preserved. Flowers already filling another designation remain unavailable.

Flowers follow cached orthogonal routes through land, swapping with blockers when necessary. Both flowers must finish a fresh growth cycle before swapping, and both spend it. Movement cycles produce no harvest rolls or Field notes observations. Uncollected harvest rolls protect a plant from recruitment and displacement. Moving and waiting flowers continue growing offscreen.

Reservations have stable precedence: older requests act first, and requests created by displacement inherit their initiating request's precedence but rank behind it. A younger request cannot reverse an older one's step unless both plants advance along their planned routes. Displaced flowers do not remember a home; a newly vacant designation chooses a matching filler again. Clearing an area cancels its filler reservations without cancelling other areas.

Route searches and chunk discovery are budgeted once per rendered frame; movement commits at most eight transactions per frame, including at 100× speed. Very large selections or distant sources therefore fill progressively. Water and buildings block routes; unreachable source/destination pairs are skipped until designations change.

### Manual water/power root upgrades

Cyan roots occupy the middle lane between heat and nutrient links. Each link carries independent water and electricity channels. Both channels share the link level, without mixing their contents. There are no water sources, sinks or irrigation effects yet; natural watering remains based on nearby terrain water.

| Level | Common flowers for this placement/upgrade | Power distribution | Water limit |
| --- | --- | --- | --- |
| 1 | 1 | Network-wide | 0.2/s |
| 2 | 2 | Network-wide | 0.6/s |
| 3 | 4 | Network-wide | 1.6/s |
| 4 | 8 | Network-wide | 4/s |
| 5 | 16 | Network-wide | 10/s |

Repaint a link to purchase the next level. Each stroke can upgrade a given link at most once. Costs can span several Common stacks; insufficient funds leave the link and inventory unchanged. Higher qualities are never spent. Level-five links incur no further charges. Transported water or electricity never earns levels. Uprooting removes both cyan channels' connection and rebuilding starts at level one.

Water does not decay. Power loses approximately 0.1% per second while stored in a connected power network, twenty times less than the heat network's 2%. All power buffers in a connected cyan-root network share electricity instantly: consumer buffers fill first, then batteries, then generator buffers. Buffers within a priority group share proportionally to their capacity. Water keeps its existing pressure-based flow and cyan links have no elevation bias. Isolated generator and battery reservoirs do not decay. Research spends actual electricity stored in generator, battery and consumer buffers, with the top bar showing their total rather than a separate shared buffer.

### Simulation speed

The lower-right speed button shows the current multiplier. Left-click increases speed by 10× up to 100×; right-click decreases it by 10× down to 0.1×. Camera movement and zoom remain at normal speed. Simulation updates are split into steps of at most 50 ms; interface and terrain rendering remain tied to real frames. The adjacent extended-zoom toggle expands camera zoom from 10% to 1000% while active. World rendering and area marker interaction remain tied to real frames.

Network view is a square icon button, with its highlight showing activation. The root drawing and uprooting menu uses colored root-type icon buttons instead of a dropdown.
