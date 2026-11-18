import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import './style.css';
import { version } from '../package.json';
import { iconMarkup, initializeIcons } from './icons';
import { flowerIcons, qualityIcons } from './assets';
import { advanceGeneration, bufferCapacityJoules, formatEnergy, fuelEnergyJoules, generatorPowerWatts, type FuelCharge } from './energy';
import { RootNetwork, rootKinds, tileKey, growWithHeat, growWithNutrients, placePaidRoot, advanceProducer, type RootKind, type Tile } from './roots';

type FlowerId = keyof typeof flowerIcons;
type Quality = { id: keyof typeof qualityIcons; name: string; weight: number };
type Flower = { id: FlowerId; x: number; y: number; growth: number; fertilizer: number };
type Stack = { flower: FlowerId; quality: Quality; count: number };
type MachineKind = 'burner' | 'generator' | 'composter';
type Mode = 'harvest' | MachineKind | 'fertilize' | 'roots' | 'uproot';
type Panel = 'inventory' | 'research' | 'generator' | null;
type FuelJob = FuelCharge & { flowerName: string; qualityName: string };
type Machine = Tile & { kind: MachineKind; job?: FuelJob; compost?: { remaining: number } };

initializeIcons();
document.title = `Overflowery v${version}`;
document.querySelector<HTMLElement>('#game-version')!.textContent = `v${version}`;

const cell = 48;
const mapSize = { cols: 42, rows: 26 };
const growSeconds = 12;
const kinds: { id: FlowerId; name: string }[] = [
  { id: 'cyan', name: 'Cyan blossom' },
  { id: 'gold', name: 'Golden bloom' },
  { id: 'neon', name: 'Neon flower' },
  { id: 'purple', name: 'Purple flower' },
];
const qualities: Quality[] = [
  { id: 'normal', name: 'Common', weight: 90 },
  { id: 'uncommon', name: 'Uncommon', weight: 9 },
  { id: 'rare', name: 'Rare', weight: 0.9 },
  { id: 'epic', name: 'Epic', weight: 0.09 },
  { id: 'legendary', name: 'Legendary', weight: 0.009 },
  { id: 'mythic', name: 'Mythic', weight: 0.0009 },
  { id: 'divine', name: 'Divine', weight: 0.00009 },
  { id: 'exalted', name: 'Exalted', weight: 0.000009 },
  { id: 'cosmic', name: 'Cosmic', weight: 0.0000009 },
  { id: 'transcendent', name: 'Transcendent', weight: 0.00000009 },
];

const view = document.querySelector<HTMLElement>('#factory-view')!;
const inventoryView = document.querySelector<HTMLElement>('#inventory')!;
const stackCount = document.querySelector<HTMLElement>('#stack-count')!;
const toggleStackCount = document.querySelector<HTMLElement>('#toggle-stack-count')!;
const harvestCount = document.querySelector<HTMLElement>('#harvest-count')!;
const energyCount = document.querySelector<HTMLElement>('#energy-count')!;
const ashCount = document.querySelector<HTMLElement>('#ash-count')!;
const cycleLabel = document.querySelector<HTMLElement>('#cycle-label')!;
const cycleTime = document.querySelector<HTMLElement>('#cycle-time')!;
const cycleProgress = document.querySelector<HTMLElement>('#cycle-progress')!;
const gameNotice = document.querySelector<HTMLElement>('#game-notice')!;
const inventoryToggle = document.querySelector<HTMLButtonElement>('#inventory-toggle')!;
const inventoryMenu = document.querySelector<HTMLElement>('#inventory-menu')!;
const researchToggle = document.querySelector<HTMLButtonElement>('#research-toggle')!;
const researchMenu = document.querySelector<HTMLElement>('#research-menu')!;
const generatorMenu = document.querySelector<HTMLElement>('#generator-menu')!;
const researchList = document.querySelector<HTMLElement>('#research-list')!;
const researchEnergy = document.querySelector<HTMLElement>('#research-energy')!;
const fuelList = document.querySelector<HTMLElement>('#fuel-list')!;
const fuelCount = document.querySelector<HTMLElement>('#fuel-count')!;
const zoomReadout = document.querySelector<HTMLButtonElement>('#zoom-reset')!;
const map = new Container();
const rootLayer = new Graphics();
const heatLayer = new Graphics();
const rootPreview = new Graphics();
const network = new RootNetwork(mapSize.cols, mapSize.rows);
const nutrientNetwork = new RootNetwork(mapSize.cols, mapSize.rows, 'nutrient');
const rootControls = document.querySelector<HTMLElement>('#root-controls')!;
const rootHint = document.querySelector<HTMLElement>('#root-hint')!;
const tileReadout = document.querySelector<HTMLElement>('#tile-readout')!;
let rootKind: RootKind = 'heat';
let rootStart: Tile | null = null;
let hoveredTile: Tile | null = null;
let showHeat = false;
let visualTimer = 0;
const app = new Application();
const flowers = new Map<string, Flower>();
const flowerSprites = new Map<string, Sprite>();
const inventory: Stack[] = [];
const fertilityMarks = new Map<string, Text>();
const machines = new Map<string, Machine>();
const researched = new Set<string>();
const keys = new Set<string>();
const camera = { x: mapSize.cols * cell / 2, y: mapSize.rows * cell / 2 };
let harvested = 0;
let energy = 0;
let ash = 0;
let mode: Mode = 'harvest';
let activePanel: Panel = 'inventory';
let selectedMachine = '';
let zoom = 1;
let noticeTimer = 0;

const research = [
  { id: 'rich-soil', name: 'Rich soil', cost: 16_000, description: 'Each ash charge boosts improved-quality odds by 8 points instead of 4.' },
  { id: 'selective-breeding', name: 'Selective breeding', cost: 36_000, description: 'Raises the base chance of uncommon or better flowers from 10% to 15%.' },
];

const keyAt = (x: number, y: number) => `${x},${y}`;

function seedPatches() {
  const patches: { x: number; y: number; flower: FlowerId }[] = [
    { x: 20, y: 13, flower: 'cyan' },
    { x: 7, y: 6, flower: 'gold' },
    { x: 34, y: 7, flower: 'neon' },
    { x: 8, y: 20, flower: 'purple' },
  ];
  for (const patch of patches) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 3 || ((dx * 5 + dy * 3 + patch.x) % 7 === 0)) continue;
      const x = patch.x + dx, y = patch.y + dy;
      const seed = Math.abs(x * 13 + y * 7) % 10;
      const growth = seed >= 7 ? 1 : 0.3 + seed * 0.09;
      flowers.set(keyAt(x, y), { id: patch.flower, x, y, growth, fertilizer: 0 });
    }
  }
}

function notify(message: string) {
  gameNotice.textContent = message;
  gameNotice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { gameNotice.hidden = true; }, 1800);
}

function rollQuality(fertilizer = 0) {
  const baseBetterChance = researched.has('selective-breeding') ? 15 : 10;
  const perCharge = researched.has('rich-soil') ? 8 : 4;
  const betterChance = Math.min(75, baseBetterChance + fertilizer * perCharge);
  const baseTailWeight = qualities.slice(1).reduce((sum, quality) => sum + quality.weight, 0);
  const weights = [100 - betterChance, ...qualities.slice(1).map((quality) => quality.weight * betterChance / baseTailWeight)];
  let roll = Math.random() * 100;
  for (let i = 0; i < qualities.length; i++) {
    roll -= weights[i];
    if (roll < 0) return qualities[i];
  }
  return qualities[0];
}

function addToInventory(flower: FlowerId, fertilizer = 0) {
  const quality = rollQuality(fertilizer);
  const stack = inventory.find((item) => item.flower === flower && item.quality.id === quality.id && item.count < 100);
  if (stack) stack.count++;
  else inventory.push({ flower, quality, count: 1 });
  harvested++;
  harvestCount.textContent = String(harvested);
  renderInventory();
  renderFuel();
  return quality;
}

function energyFor(quality: Quality) {
  return fuelEnergyJoules(qualities.indexOf(quality));
}

function updateResources() {
  energyCount.textContent = `${formatEnergy(energy)} / ${formatEnergy(bufferCapacityJoules)}`;
  ashCount.textContent = String(ash);
  researchEnergy.textContent = formatEnergy(energy);
  document.querySelector<HTMLElement>('#buffer-charge')!.textContent = `${formatEnergy(energy)} / ${formatEnergy(bufferCapacityJoules)}`;
  const bufferMeter = document.querySelector<HTMLMeterElement>('#energy-buffer')!;
  bufferMeter.max = bufferCapacityJoules;
  bufferMeter.value = energy;
}

function updateGeneratorCycle() {
  const machine = machines.get(selectedMachine);
  document.querySelector<HTMLElement>('#machine-title')!.textContent = machine?.kind === 'composter' ? 'Composter' : machine?.kind === 'generator' ? 'Heat generator' : 'Petal burner';
  document.querySelector<HTMLElement>('#machine-hint')!.textContent = machine?.kind === 'composter'
    ? 'Load flowers to produce 8 nutrients each at 2 nutrients/s. Nutrient roots feed growing flowers. Pauses when its tile is full.'
    : machine?.kind === 'generator' ? 'Consumes heat from its tile to generate up to 1 kW electricity. Connect heat roots from a burner. Stops at a full 100 kJ buffer.'
    : 'Burns flower fuel into heat at 1 kW. Connect heat roots to flowers and generators. Pauses when its tile is full. Each finished flower yields 1 ash.';
  if (machine?.kind === 'generator') {
    cycleLabel.textContent = energy >= bufferCapacityJoules ? 'Paused · electric buffer full' : 'Converting available heat';
    cycleTime.textContent = `${formatEnergy(network.stored.get(tileKey(machine)) ?? 0)} heat available · up to 1 kW electricity`;
    cycleProgress.style.width = '0%';
    return;
  }
  if (machine?.compost) {
    const paused = (nutrientNetwork.stored.get(tileKey(machine)) ?? 0) >= 20;
    cycleLabel.textContent = paused ? 'Paused · nutrient storage full' : 'Composting';
    cycleTime.textContent = `${machine.compost.remaining.toFixed(1)} nutrients left · 2 nutrients/s`;
    cycleProgress.style.width = `${(1 - machine.compost.remaining / 8) * 100}%`;
    return;
  }
  const job = machine?.job;
  if (!job) {
    cycleLabel.textContent = 'Idle · ready for fuel';
    cycleTime.textContent = machine?.kind === 'composter' ? 'One flower produces 8 nutrients in 4 seconds.' : '1 kW heat · common fuel lasts 2 seconds.';
    cycleProgress.style.width = '0%';
    return;
  }
  const paused = !!machine && (network.stored.get(tileKey(machine)) ?? 0) >= network.capacity(machine);
  cycleLabel.textContent = `${paused ? 'Paused · heat storage full ·' : 'Burning'} ${job.qualityName} ${job.flowerName}`;
  cycleTime.textContent = `${paused ? '0 kW (paused)' : '1 kW heat'} · ${formatEnergy(job.remainingJoules)} fuel · ${(job.remainingJoules / generatorPowerWatts).toFixed(1)}s left · +1 ash on completion`;
  cycleProgress.style.width = `${(1 - job.remainingJoules / job.totalJoules) * 100}%`;
}

function renderInventory() {
  stackCount.textContent = `${inventory.length} ${inventory.length === 1 ? 'STACK' : 'STACKS'}`;
  toggleStackCount.textContent = String(inventory.length);
  if (!inventory.length) {
    inventoryView.innerHTML = `<div class="inventory-empty">${iconMarkup('flower')}<b>No flowers yet</b><small>Find a patch and click a bloom.</small></div>`;
    return;
  }
  inventoryView.innerHTML = inventory.map((stack) => {
    const flower = kinds.find((item) => item.id === stack.flower)!;
    return `<div class="item-stack" title="${stack.quality.name} ${flower.name} · ${stack.count}/100">
      <span class="item-picture"><img class="flower-item" src="${flowerIcons[stack.flower]}" alt="${flower.name}">
      <img class="quality-badge" src="${qualityIcons[stack.quality.id]}" alt="${stack.quality.name}"></span>
      <span class="item-name">${flower.name}</span><b class="item-count">${stack.count}</b>
      <span class="item-quality">${stack.quality.name}</span>
    </div>`;
  }).join('');
}

function renderFuel() {
  const burner = machines.get(selectedMachine);
  const totalFlowers = inventory.reduce((sum, stack) => sum + stack.count, 0);
  fuelCount.textContent = `${totalFlowers} FLOWERS`;
  updateGeneratorCycle();
  if (burner?.kind === 'generator') {
    fuelList.innerHTML = '<div class="fuel-empty">Generators use heat, not flowers. Connect heat roots from a fueled burner to this tile.</div>';
    return;
  }
  if (burner?.job || burner?.compost) {
    fuelList.innerHTML = '<div class="fuel-empty">Processing a flower. Load another when it finishes.</div>';
    return;
  }
  if (!inventory.length) {
    fuelList.innerHTML = '<div class="fuel-empty">Harvest flowers first to fuel this burner.</div>';
    return;
  }
  fuelList.innerHTML = inventory.map((stack, index) => {
    const flower = kinds.find((item) => item.id === stack.flower)!;
    const yieldEnergy = energyFor(stack.quality);
    return `<div class="fuel-card">
      <span class="fuel-picture"><img src="${flowerIcons[stack.flower]}" alt=""><img src="${qualityIcons[stack.quality.id]}" alt=""></span>
      <span class="fuel-copy"><b>${stack.quality.name} ${flower.name} ×${stack.count}</b><small>${burner?.kind === 'composter' ? '8 nutrients · 4s processing' : `${formatEnergy(yieldEnergy)} heat · ${yieldEnergy / generatorPowerWatts}s · +1 ash`}</small></span>
      <button class="fuel-burn" type="button" data-stack="${index}">Load 1</button>
    </div>`;
  }).join('');
  fuelList.querySelectorAll<HTMLButtonElement>('.fuel-burn').forEach((button) => {
    button.addEventListener('click', () => burnStack(Number(button.dataset.stack)));
  });
}

function renderResearch() {
  researchList.innerHTML = research.map((tech) => {
    const done = researched.has(tech.id);
    const canBuy = energy >= tech.cost;
    return `<div class="research-card${done ? ' done' : ''}">
      <span class="research-copy"><b>${tech.name}</b><small>${tech.description}</small></span>
      <button class="research-buy" type="button" data-tech="${tech.id}" ${done || !canBuy ? 'disabled' : ''}>${done ? 'Done' : formatEnergy(tech.cost)}</button>
    </div>`;
  }).join('');
  researchList.querySelectorAll<HTMLButtonElement>('.research-buy:not(:disabled)').forEach((button) => {
    button.addEventListener('click', () => buyResearch(button.dataset.tech!));
  });
}

function burnStack(index: number) {
  const burner = machines.get(selectedMachine);
  const stack = inventory[index];
  if (!stack || !burner || burner.kind === 'generator' || burner.job || burner.compost) return;
  const flower = kinds.find((item) => item.id === stack.flower)!;
  if (burner.kind === 'composter') burner.compost = { remaining: 8 };
  else burner.job = {
    flowerName: flower.name,
    qualityName: stack.quality.name,
    totalJoules: energyFor(stack.quality),
    remainingJoules: energyFor(stack.quality),
  };
  stack.count--;
  if (!stack.count) inventory.splice(index, 1);
  renderInventory();
  renderFuel();
  notify(`${stack.quality.name} ${flower.name} loaded into ${burner.kind}`);
}

function buyResearch(id: string) {
  const tech = research.find((item) => item.id === id);
  if (!tech || researched.has(id) || energy < tech.cost) return;
  energy -= tech.cost;
  researched.add(id);
  updateResources();
  renderResearch();
  updateGeneratorCycle();
}

function setPanel(panel: Panel) {
  activePanel = panel;
  inventoryMenu.hidden = panel !== 'inventory';
  researchMenu.hidden = panel !== 'research';
  generatorMenu.hidden = panel !== 'generator';
  inventoryToggle.setAttribute('aria-expanded', String(panel === 'inventory'));
  researchToggle.setAttribute('aria-expanded', String(panel === 'research'));
}

function setMode(nextMode: Mode) {
  mode = nextMode;
  document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => button.classList.remove('active'));
  document.querySelector<HTMLButtonElement>(`#tool-${nextMode}`)!.classList.add('active');
  rootStart = null;
  rootPreview.clear();
  rootControls.hidden = nextMode !== 'roots' && nextMode !== 'uproot';
  updateRootHint();
  setPanel(null);
}

function updateRootHint() {
  rootHint.textContent = `${mode === 'uproot' ? 'Remove a link' : rootKinds[rootKind].description} · ${rootStart ? 'Click an adjacent tile to continue' : 'Click a tile, then its N/S/E/W neighbor'} · Esc / right-click cancels`;
}

function editRoot(tile: Tile) {
  if (!rootStart) rootStart = tile;
  else if (tileKey(rootStart) === tileKey(tile)) rootStart = null;
  else if (Math.abs(rootStart.x - tile.x) + Math.abs(rootStart.y - tile.y) !== 1) {
    notify('Roots only connect adjacent tiles: north, south, east or west');
  } else {
    const selectedNetwork = rootKind === 'heat' ? network : nutrientNetwork;
    if (mode === 'uproot') selectedNetwork.remove(rootStart, tile);
    else {
      const result = placePaidRoot(selectedNetwork, rootStart, tile, inventory);
      if (result === 'unaffordable') { notify('Each root link costs 1 Common flower. Harvest some first.'); return; }
      renderInventory();
      renderFuel();
    }
    rootStart = tile;
    drawNetwork();
  }
  updateRootHint();
  drawRootPreview();
}

function drawRootPreview() {
  rootPreview.clear();
  if (!rootStart) return;
  rootPreview.rect(rootStart.x * cell + 2, rootStart.y * cell + 2, cell - 4, cell - 4).stroke({ color: 0xe2ef9a, width: 2 });
  if (!hoveredTile) return;
  const valid = Math.abs(rootStart.x - hoveredTile.x) + Math.abs(rootStart.y - hoveredTile.y) === 1;
  rootPreview.moveTo((rootStart.x + 0.5) * cell, (rootStart.y + 0.5) * cell)
    .lineTo((hoveredTile.x + 0.5) * cell, (hoveredTile.y + 0.5) * cell)
    .stroke({ color: valid ? rootKinds[rootKind].color : 0xe87575, width: 3, alpha: 0.8 });
}

function drawNetwork() {
  rootLayer.clear();
  heatLayer.clear();
  for (const root of [...network.roots.values(), ...nutrientNetwork.roots.values()]) {
    const color = rootKinds[root.kind].color;
    const offset = root.kind === 'nutrient' ? 5 : -3;
    const ax = (root.a.x + 0.5) * cell + offset, ay = (root.a.y + 0.5) * cell + offset;
    const bx = (root.b.x + 0.5) * cell + offset, by = (root.b.y + 0.5) * cell + offset;
    rootLayer.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0x10150d, width: 8 });
    rootLayer.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width: 4 });
    rootLayer.circle((ax + bx) / 2, (ay + by) / 2, 3).fill(color);
  }
  if (showHeat) for (const [key, heat] of network.stored) {
    const [x, y] = key.split(',').map(Number);
    heatLayer.rect(x * cell + 1, y * cell + 1, cell - 2, cell - 2)
      .fill({ color: 0xff7f32, alpha: 0.08 + 0.5 * heat / network.capacity({ x, y }) });
  }
  if (showHeat) for (const [key, nutrients] of nutrientNetwork.stored) {
    const [x, y] = key.split(',').map(Number);
    heatLayer.circle((x + 0.8) * cell, (y + 0.2) * cell, 2 + 5 * nutrients / 20).fill(0x89d867);
  }
  const totalHeat = [...network.stored.values()].reduce((sum, heat) => sum + heat, 0);
  const totalNutrients = [...nutrientNetwork.stored.values()].reduce((sum, amount) => sum + amount, 0);
  document.querySelector<HTMLElement>('#network-summary')!.textContent = `${network.roots.size} heat / ${nutrientNetwork.roots.size} nutrient roots · ${formatEnergy(totalHeat)} heat · ${totalNutrients.toFixed(1)} nutrients`;
  if (hoveredTile) {
    const key = tileKey(hoveredTile);
    const flower = flowers.get(key);
    tileReadout.textContent = `Tile ${hoveredTile.x}, ${hoveredTile.y} · ${formatEnergy(network.stored.get(key) ?? 0)} heat · ${(nutrientNetwork.stored.get(key) ?? 0).toFixed(1)} / 20 nutrients${flower ? ` · ${Math.floor(flower.growth * 100)}% grown` : ''}`;
  }
}

function addMachine(x: number, y: number, kind: MachineKind) {
  const id = keyAt(x, y);
  const machine = new Container();
  machine.position.set((x + 0.5) * cell, (y + 0.5) * cell);
  const color = kind === 'composter' ? 0x89d867 : kind === 'generator' ? 0xead16a : 0xffad62;
  const base = new Graphics().roundRect(-18, -18, 36, 36, 8).fill(0x34291f).stroke({ color, width: 2 });
  const symbol = new Graphics().svg(iconMarkup(kind, `#${color.toString(16).padStart(6, '0')}`));
  symbol.position.set(-12, -12);
  machine.addChild(base, symbol);
  map.addChild(machine);
  machines.set(id, { x, y, kind });
  selectedMachine = id;
  setMode('harvest');
  renderFuel();
  setPanel('generator');
}

function fertilizeFlower(flower: Flower) {
  const id = keyAt(flower.x, flower.y);
  const level = flower.fertilizer;
  const cap = 5;
  if (!ash) { notify('No ash · burn flowers in a burner first'); return; }
  if (level >= cap) { notify('This flower has reached its fertilizer limit'); return; }
  ash--;
  flower.fertilizer++;
  let marker = fertilityMarks.get(id);
  if (!marker) {
    marker = new Text({ text: '', resolution: Math.max(2.5, (window.devicePixelRatio || 1) * 2.5), style: { fontFamily: 'monospace', fontSize: 10, fill: 0xffd985, stroke: { color: 0x182016, width: 3 } } });
    marker.position.set((flower.x + 0.55) * cell, (flower.y + 0.55) * cell);
    fertilityMarks.set(id, marker);
    map.addChild(marker);
  }
  marker.text = `+${level + 1}`;
  updateResources();
  notify('Ash applied · improved quality odds on the next harvest');
}

function buildMap(textures: Map<FlowerId, Texture>) {
  const ground = new Graphics();
  for (let y = 0; y < mapSize.rows; y++) for (let x = 0; x < mapSize.cols; x++) {
    const px = x * cell, py = y * cell;
    const shade = (x * 7 + y * 13) % 5 === 0 ? 0x1b281b : 0x192419;
    ground.rect(px, py, cell, cell).fill(shade).stroke({ color: 0x243124, width: 1 });
    if ((x * 13 + y * 17) % 11 === 0) {
      const tuft = new Graphics().circle(px + 10 + (x % 19), py + 12 + (y % 17), 1.2).fill(0x52694a, 0.4);
      map.addChild(tuft);
    }
  }
  map.addChildAt(ground, 0);
  map.addChild(rootLayer, heatLayer);

  for (const flower of flowers.values()) {
    const sprite = new Sprite(textures.get(flower.id)!);
    sprite.anchor.set(0.5);
    sprite.position.set((flower.x + 0.5) * cell, (flower.y + 0.5) * cell);
    flowerSprites.set(keyAt(flower.x, flower.y), sprite);
    map.addChild(sprite);
    updateFlowerVisual(flower);
  }
  map.addChild(rootPreview);
}

function updateFlowerVisual(flower: Flower) {
  const sprite = flowerSprites.get(keyAt(flower.x, flower.y));
  if (!sprite) return;
  const size = 18 + flower.growth * 24;
  sprite.width = size;
  sprite.height = size;
  sprite.alpha = 0.35 + flower.growth * 0.65;
  sprite.tint = flower.growth >= 1 ? 0xffffff : 0xc1d2ac;
}

function clampCamera() {
  const halfW = app.screen.width / 2, halfH = app.screen.height / 2;
  const mapW = mapSize.cols * cell, mapH = mapSize.rows * cell;
  const visibleW = halfW / zoom, visibleH = halfH / zoom;
  camera.x = Math.max(Math.min(visibleW, mapW / 2), Math.min(Math.max(visibleW, mapW - visibleW), camera.x));
  camera.y = Math.max(Math.min(visibleH, mapH / 2), Math.min(Math.max(visibleH, mapH - visibleH), camera.y));
  map.scale.set(zoom);
  map.position.set(halfW - camera.x * zoom, halfH - camera.y * zoom);
}

async function start() {
  await app.init({ resizeTo: window, background: '#172217', antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
  view.appendChild(app.canvas);

  const textures = new Map<FlowerId, Texture>();
  await Promise.all(kinds.map(async (flower) => {
    const texture = await Assets.load<Texture>(flowerIcons[flower.id]);
    textures.set(flower.id, texture);
  }));

  seedPatches();
  app.stage.addChild(map);
  buildMap(textures);
  clampCamera();
  renderInventory();
  renderFuel();
  renderResearch();
  updateResources();

  window.addEventListener('resize', clampCamera);
  inventoryToggle.addEventListener('click', () => {
    setPanel(activePanel === 'inventory' ? null : 'inventory');
  });
  researchToggle.addEventListener('click', () => setPanel(activePanel === 'research' ? null : 'research'));
  document.querySelector<HTMLButtonElement>('#tool-harvest')!.addEventListener('click', () => setMode('harvest'));
  document.querySelector<HTMLButtonElement>('#tool-burner')!.addEventListener('click', () => setMode('burner'));
  document.querySelector<HTMLButtonElement>('#tool-generator')!.addEventListener('click', () => setMode('generator'));
  document.querySelector<HTMLButtonElement>('#tool-composter')!.addEventListener('click', () => setMode('composter'));
  document.querySelector<HTMLButtonElement>('#tool-fertilize')!.addEventListener('click', () => setMode('fertilize'));
  document.querySelector<HTMLButtonElement>('#tool-roots')!.addEventListener('click', () => setMode('roots'));
  document.querySelector<HTMLButtonElement>('#tool-uproot')!.addEventListener('click', () => setMode('uproot'));
  document.querySelector<HTMLSelectElement>('#root-kind')!.addEventListener('change', (event) => {
    rootKind = (event.target as HTMLSelectElement).value as RootKind;
    updateRootHint();
    drawRootPreview();
  });
  document.querySelector<HTMLButtonElement>('#heat-toggle')!.addEventListener('click', (event) => {
    showHeat = !showHeat;
    (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(showHeat));
    drawNetwork();
  });
  app.canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    rootStart = null;
    updateRootHint();
    drawRootPreview();
  });
  app.stage.eventMode = 'static';
  app.stage.on('pointermove', (event) => {
    const point = map.toLocal(event.global);
    const x = Math.floor(point.x / cell), y = Math.floor(point.y / cell);
    hoveredTile = x >= 0 && y >= 0 && x < mapSize.cols && y < mapSize.rows ? { x, y } : null;
    drawRootPreview();
  });
  zoomReadout.addEventListener('click', () => {
    zoom = 1;
    zoomReadout.textContent = '100%';
    clampCamera();
  });
  app.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = app.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * app.screen.width / rect.width;
    const y = (event.clientY - rect.top) * app.screen.height / rect.height;
    const worldX = camera.x + (x - app.screen.width / 2) / zoom;
    const worldY = camera.y + (y - app.screen.height / 2) / zoom;
    zoom = Math.max(0.5, Math.min(2.5, zoom * Math.exp(-event.deltaY * 0.001)));
    camera.x = worldX - (x - app.screen.width / 2) / zoom;
    camera.y = worldY - (y - app.screen.height / 2) / zoom;
    zoomReadout.textContent = `${Math.round(zoom * 100)}%`;
    clampCamera();
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'escape') { rootStart = null; updateRootHint(); drawRootPreview(); }
    if ((event.target as HTMLElement)?.closest('select, input, textarea')) return;
    if ('wasd'.includes(key)) { event.preventDefault(); keys.add(key); }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  app.ticker.add((ticker) => {
    const seconds = ticker.deltaMS / 1000;
    const step = ticker.deltaMS * 0.28 / zoom;
    const moving = keys.has('w') || keys.has('s') || keys.has('a') || keys.has('d');
    if (keys.has('w')) camera.y -= step;
    if (keys.has('s')) camera.y += step;
    if (keys.has('a')) camera.x -= step;
    if (keys.has('d')) camera.x += step;
    if (moving) clampCamera();

    const previousEnergy = energy;
    for (const burner of machines.values()) {
      if (burner.job) {
        burner.job.remainingJoules = advanceProducer(network, burner, burner.job.remainingJoules, 1000, seconds);
      }
      if (burner.compost) {
        burner.compost.remaining = advanceProducer(nutrientNetwork, burner, burner.compost.remaining, 2, seconds);
      }
    }
    network.advance(seconds);
    nutrientNetwork.advance(seconds);
    const generators = [...machines.values()].filter((machine) => machine.kind === 'generator');
    const charges = generators.map((machine) => {
      const heat = network.stored.get(tileKey(machine)) ?? 0;
      return { totalJoules: heat, remainingJoules: heat };
    });
    energy = advanceGeneration(charges, energy, seconds);
    generators.forEach((machine, index) => network.consume(machine, charges[index].totalJoules - charges[index].remainingJoules));
    for (const flower of flowers.values()) {
      if (flower.growth >= 1) continue;
      const result = growWithHeat(flower.growth, seconds, network.stored.get(tileKey(flower)) ?? 0);
      network.consume(flower, result.heatUsed);
      const fed = growWithNutrients(result.growth, seconds, nutrientNetwork.stored.get(tileKey(flower)) ?? 0);
      nutrientNetwork.consume(flower, fed.nutrientsUsed);
      flower.growth = fed.growth;
      updateFlowerVisual(flower);
    }
    visualTimer += seconds;
    if (visualTimer >= 0.1) { drawNetwork(); visualTimer = 0; }
    let completedCount = 0;
    let completedCompost = 0;
    for (const burner of machines.values()) {
      if (burner.compost && burner.compost.remaining <= 0) { burner.compost = undefined; completedCompost++; }
      if (!burner.job) continue;
      if (burner.job.remainingJoules <= 0) {
        completedCount++;
        ash++;
        burner.job = undefined;
      }
    }
    if (activePanel === 'generator') updateGeneratorCycle();
    if (energy !== previousEnergy || completedCount) {
      updateResources();
      if (research.some((tech) => previousEnergy < tech.cost && energy >= tech.cost)) renderResearch();
    }
    if (completedCount || completedCompost) {
      renderFuel();
      notify(completedCount ? `Burn complete · +${completedCount} ash` : 'Composting complete · nutrients delivered');
    }
  });

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = map.toLocal(event.global);
    const x = Math.floor(point.x / cell), y = Math.floor(point.y / cell);
    if (x < 0 || y < 0 || x >= mapSize.cols || y >= mapSize.rows) return;
    const id = keyAt(x, y);
    if (mode === 'roots' || mode === 'uproot') { editRoot({ x, y }); return; }
    if (machines.has(id)) {
      selectedMachine = id;
      renderFuel();
      setPanel('generator');
      return;
    }
    if (mode === 'burner' || mode === 'generator' || mode === 'composter') {
      if (!flowers.has(id)) addMachine(x, y, mode);
      else notify('Choose an empty tile for the machine');
      return;
    }
    const flower = flowers.get(id);
    if (!flower) return;
    if (mode === 'fertilize') fertilizeFlower(flower);
    else if (flower.growth < 1) {
      notify(`Still growing · ${((1 - flower.growth) * growSeconds).toFixed(1)}s left`);
    } else {
      const quality = addToInventory(flower.id, flower.fertilizer);
      flower.growth = 0;
      updateFlowerVisual(flower);
      notify(`${quality.name} ${kinds.find((item) => item.id === flower.id)!.name} picked · regrows in ${growSeconds}s`);
    }
  });
}

void start();
