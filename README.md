# Overflowery

Small PixiJS + TypeScript flower-gathering prototype.

Current release: **0.1.0**. The in-game version and browser title read the version from `package.json`. See `CHANGELOG.md` for release notes.

## Publish on GitHub Pages

The game is a static site; no application server or database is required. The included `.github/workflows/deploy-pages.yml` installs dependencies, tests, builds, and deploys `dist` whenever `main` is pushed. Vite uses relative asset URLs so a repository name such as `Overflowery` needs no additional base-path configuration.

1. Create an empty public GitHub repository (for example `Overflowery`). Do not initialize it with a README if uploading this folder using the commands below.
2. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. From a PowerShell terminal in this project, initialize and push the source. Replace `YOUR_USERNAME` and, if different, the repository name:

   ```powershell
   git init -b main
   git add .
   git commit -m "Release v0.1.0"
   git remote add origin https://github.com/YOUR_USERNAME/Overflowery.git
   git push -u origin main
   git tag -a v0.1.0 -m "Overflowery v0.1.0"
   git push origin v0.1.0
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

The game loop and UI live in `src/main.ts`, with styles in `src/style.css`. Graphics are imported through `src/assets.ts` from `graphics/icons`: 64×64 flower icons for both the map and UI, plus quality badges. Original sprites remain in `graphics/sprites` and are not bundled. Earlier bordered flower icons are preserved as `flower-*-bordered.png`. Regenerate the unbordered flower icons on Windows with `pwsh -File scripts/resize-flower-icons.ps1`. Vite bundles imported assets and checks that the referenced files exist during `pnpm build`.

```sh
pnpm install --store-dir .pnpm-store
pnpm dev
```

Use WASD to explore and click mature flowers to harvest them. Unheated, unfed flowers regrow in 12 seconds. Items stack by species and quality, up to 100 per stack. Base pickup odds are 90% Common, 9% Uncommon, 0.9% Rare, then one tenth of the previous tier for each higher quality.

## Machines and energy

Place machines on empty tiles, then click them to inspect or load a flower:

- **Burner:** consumes flowers to produce 1 kW of heat at its tile. Common flowers contain 2 kJ; fuel energy doubles each quality tier. Produces one ash per fully consumed flower. Pauses without wasting fuel when its tile's 4 kJ heat storage is full. Burners do not produce electricity.
- **Generator:** consumes heat delivered to its tile through heat roots, converting it 1:1 into electricity at up to 1 kW. Has no flower input. Generators share a 100 kJ electric buffer and stop consuming heat when it is full.
- **Composter:** consumes a flower to produce 8 nutrients at 2 nutrients per second. All qualities give the same nutrient yield. Its tile stores 20 nutrients; production pauses without wasting the remaining input when full. Composters produce neither heat nor electricity nor ash.

Use **Research** to spend stored electricity on upgrades: Rich soil costs 16 kJ and Selective breeding costs 36 kJ. Use **Fertilize** to spend ash on improved quality odds. Energy is stored in Joules and shown in J or kJ.

## Heat and nutrient roots

Select **Roots**, choose **Heat** or **Nutrient**, then click two neighboring tile centers. Continue clicking adjacent tiles to extend the route. Links work under any tile, including machines and flowers. Only north/south/east/west connections are allowed.

Each new link costs **one Common flower of any species** from inventory. Rare flowers are never used for construction. Clicking an existing link does not charge again. Both networks can occupy the same tile pair and stay independent. **Uproot** removes only the selected network's link with no refund. Escape, right-click, or clicking the starting tile cancels the current route.

| Network | Link transfer limit | Tile storage | Loss |
| --- | --- | --- | --- |
| Heat (orange) | 1 kW | 4 kJ | About 2% per second |
| Nutrient (green) | 4 nutrients/s | 20 nutrients | None |

Flow depends on the difference in tile storage fill levels. Connect burner tiles to generator tiles for electricity; branch heat roots toward flowers to accelerate growth. Connect composter tiles to flowers using nutrient roots.

Growing flowers consume up to 100 W of heat and 1 nutrient/s. Either resource alone can double normal growth speed; both can reach 3× speed (4 seconds per regrowth with continuous supply). Mature flowers consume neither. Without supplies, flowers keep growing at their normal rate.

**Network view** displays heat as orange tile shading and nutrients as green dots. Hover a tile to inspect resources and growth. Networks, machines, and inventory reset on refresh. Simulation code is in `src/roots.ts` and `src/energy.ts`; run `pnpm test` for placement, construction cost, transport, processing, growth, and buffer checks.
