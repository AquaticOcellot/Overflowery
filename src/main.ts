import { PlantMovement } from './plant-movement';
import { relocatePlants } from './plant-relocation';
import { SimulationSpeed } from './speed';
import { rectangleCells, removeDesignationArea, type Designation, type DesignationFlower } from './designations';
import { HarvestJournal, initialGrowthTiming, randomGrowthDuration } from './harvest';
import { createFieldNotes } from './observations';
import { Application, Assets, Container, Graphics, Sprite, Spritesheet, Text, Texture } from 'pixi.js';
import './style.css';
import { BuildingIndex, type Rotation } from './buildings';
import { ChunkWorld, chunkCoordinate, chunkKey, elevationAt, environmentGrowth, type WorldChunk } from './world';
import { strokeTiles } from './strokes';
import { version } from '../package.json';
import { initializeIcons } from './icons';
import { flowerIcons, flowerLevel5Icons, itemLevelIcons, qualityIcons, qualityOrder } from './assets';
import fireSpritesheetData from '../graphics/sprites/fire.json';
import fireSpritesheetImage from '../graphics/sprites/fire.png';
import { createInventoryView } from './ui/inventory-view';
import { createPanelUi } from './ui/panels';
import { createDesignationUi } from './ui/designations';
import { createNetworkDrawing } from './rendering/networks';
import { createBuildingPreview, isBuildingMode } from './rendering/building-preview';
import { createWorldView } from './rendering/world-view';
import { bindNavigationControls } from './input/navigation';
import { bindSimulationTicker } from './game/simulation';
import { harvesterEnergyPerRoll, harvesterTiles } from './game/harvester';
import { createMachineSystem } from './game/machines';
import { createMachineStatus } from './ui/machine-status';
import { createInspectionReadout } from './ui/inspection';
import { bindGameControls } from './ui/game-controls';
import { bindWorldActions } from './input/world-actions';
import { passiveGrowth as advancePassiveGrowth, prepareHarvest as prepareFlowerHarvest } from './game/flowers';
import { inventorySlots, stackLimit, storeFlower, type Inventory } from './inventory';
import { formatEnergy } from './energy';
import { RootNetwork, createUtilityNetworks, storedPower, spendPower, rootKey, rootStats, tileKey, placePaidRoot, type RootKind, type Root, type Tile } from './roots';

import type { Flower, FlowerId, Machine, Mode, Panel, Quality, Stack } from './game/types';

initializeIcons();
document.title = `Overflowery ${version}`;
document.querySelector<HTMLElement>('#game-version')!.textContent = version;

const cell = 64;
const world = new ChunkWorld();
const journal = new HarvestJournal();
const terrainLayer = new Container();
const flowerLayer = new Container();
const worldTextures = new Map<FlowerId, Texture[]>();
let fireFrames: Texture[] = [];
const chunkViews = new Map<string, { ground: Graphics; decorations: Graphics; flowers: Set<string> }>();
let simulationTime = 0;
const growSeconds = 12;
const flowerNames: Record<FlowerId, string> = {
  blue: 'Blue blossom', yellow: 'Yellow bloom', purple: 'Purple flower', red: 'Red flower',
};
const kinds = (Object.keys(flowerIcons) as FlowerId[]).map(id => ({ id, name: flowerNames[id] }));
const itemKinds = [...kinds, { id: 'greenery', name: 'Greenery' }];
const qualities: Quality[] = [
  { id: 'normal', name: 'Common' },
  { id: 'uncommon', name: 'Uncommon' },
  { id: 'rare', name: 'Rare' },
  { id: 'epic', name: 'Epic' },
  { id: 'legendary', name: 'Legendary' },
  { id: 'mythic', name: 'Mythic' },
  { id: 'exalted', name: 'Exalted' },
  { id: 'divine', name: 'Divine' },
  { id: 'cosmic', name: 'Cosmic' },
  { id: 'transcendent', name: 'Transcendent' },
];

const fieldNotes = createFieldNotes(journal, kinds.map(f => ({ ...f, icon: flowerLevel5Icons[f.id] })), qualities.map(q => ({ name: q.name, icon: qualityIcons[q.id] })));
const view = document.querySelector<HTMLElement>('#factory-view')!;
const inventoryView = document.querySelector<HTMLElement>('#inventory')!;
const toggleStackCount = document.querySelector<HTMLElement>('#toggle-stack-count')!;
const energyCount = document.querySelector<HTMLElement>('#energy-count')!;
const ashCount = document.querySelector<HTMLElement>('#ash-count')!;
const cycleLabel = document.querySelector<HTMLElement>('#cycle-label')!;
const cycleTime = document.querySelector<HTMLElement>('#cycle-time')!;
const cycleProgress = document.querySelector<HTMLElement>('#cycle-progress')!;
const gameNotice = document.querySelector<HTMLElement>('#game-notice')!;
const inventoryToggle = document.querySelector<HTMLButtonElement>('#inventory-toggle')!;
const inventoryMenu = document.querySelector<HTMLElement>('#inventory-menu')!;
const fertilizeTool = document.querySelector<HTMLButtonElement>('#tool-fertilize')!;
const researchToggle = document.querySelector<HTMLButtonElement>('#research-toggle')!;
const researchMenu = document.querySelector<HTMLElement>('#research-menu')!;
const generatorMenu = document.querySelector<HTMLElement>('#generator-menu')!;
const researchList = document.querySelector<HTMLElement>('#research-list')!;
const researchEnergy = document.querySelector<HTMLElement>('#research-energy')!;
const fuelList = document.querySelector<HTMLElement>('#fuel-list')!;
const fuelCount = document.querySelector<HTMLElement>('#fuel-count')!;
const zoomReadout = document.querySelector<HTMLButtonElement>('#zoom-reset')!;
const zoomRangeToggle = document.querySelector<HTMLButtonElement>('#zoom-range-toggle')!;
const map = new Container();
const rootLayer = new Graphics();
const heatLayer = new Graphics();
const rootBadgeLayer = new Container();
const rootBadgeSprites = new Map<Root, Sprite>();
const rootQualityTextures: Texture[] = [];
const overgrowthQualityTextures = new Map<string, Texture>();
const rootPreview = new Graphics();
const terrainElevation = (tile: Tile) => elevationAt(tile.x, tile.y, world.seed);
const network = new RootNetwork(Infinity, Infinity, 'heat', terrainElevation);
const nutrientNetwork = new RootNetwork(Infinity, Infinity, 'nutrient', terrainElevation);
const { power: powerNetwork, water: waterNetwork } = createUtilityNetworks(Infinity, Infinity, terrainElevation);
const paintedRoots = new Set<string>();
const rootControls = document.querySelector<HTMLElement>('#root-controls')!;
const tileReadout = document.querySelector<HTMLElement>('#tile-readout')!;
let rootKind: RootKind = 'heat';
const simulationSpeed = new SimulationSpeed();
let rootStart: Tile | null = null;
let hoveredTile: Tile | null = null;
let hoveredPoint: { x: number; y: number } | null = null;
let pointerScreen: { x: number; y: number } | null = null;
let showHeat = false;
let worldStroke: { pointerId: number; mode: 'harvest' | 'roots' | 'uproot'; last: Tile } | null = null;
let cancelInventoryDrag = () => {};
const app = new Application();
let nextFlowerUid = 1;
const flowers = new Map<string, Flower>();
const flowerSprites = new Map<string, Sprite>();
const flowerBadges = new Map<string, Sprite>();
const hydratedChunks = new Set<string>();
const designations = new Map<string, Designation>();
const designationLayer = new Graphics();
let designationDrag: { start: Tile; end: Tile; pointerId: number; erase: boolean } | undefined;
let designatedFlower: DesignationFlower = 'blue';
let clearingDesignations = false;
const inventory: Inventory<Stack> = Array(inventorySlots).fill(null);
inventory[0] = { flower: 'greenery', quality: qualities[0], count: 100 };
const fertilityMarks = new Map<string, Text>();
const buildingIndex = new BuildingIndex<Machine>();
const machines = buildingIndex.buildings;
const placementPreview = new Graphics();
const harvesterRangeLayer = new Graphics();
let buildingRotation: Rotation = 0;
const researched = new Set<string>();
const researchLevels = new Map<string, number>();
function updateToolUnlocks() {
  const fertilizingUnlocked = researched.has('rich-soil');
  fertilizeTool.disabled = !fertilizingUnlocked;
  fertilizeTool.dataset.help = fertilizingUnlocked
    ? 'Spend ash to improve a flower\'s next harvest. Each level costs the level cubed in ash.'
    : 'Unlock Rich Soil research to fertilize flowers with ash.';
  document.querySelector<HTMLButtonElement>('#tool-harvest')!.dataset.help = researched.has('field-tools')
    ? 'Click to pick one flower, or drag to pick an area.'
    : 'Click a flower to pick it. Area picking unlocks in Research.';
}
updateToolUnlocks();
function updateFertilizeHelp() {
  if (fertilizeTool.disabled) return;
  const flower = hoveredTile ? flowers.get(tileKey(hoveredTile)) : undefined;
  const level = flower?.fertilizer ?? 0;
  if (flower && level >= 5) {
    fertilizeTool.dataset.help = 'This flower has reached its fertilizer limit.';
    return;
  }
  const cost = (level + 1) ** 3;
  fertilizeTool.dataset.help = flower
    ? `Spend ${cost} ash to fertilize this flower to level ${level + 1}. Costs rise with each level.`
    : `Spend ash to fertilize flowers. The next level costs ${cost} ash; costs rise with each level.`;
}
const keys = new Set<string>();
const camera = { x: 0, y: 0 };
let energy = 0;
let ash = 0;
let mode: Mode = 'harvest';
let activePanel: Panel = 'inventory';
let selectedMachine = '';
let zoom = 1;
let lastHarvesterRange = '';

function updateHarvesterRange() {
  let origin: Tile | undefined;
  const hoveredMachine = hoveredTile ? buildingIndex.at(hoveredTile) : undefined;
  if (hoveredMachine?.kind === 'harvester') origin = hoveredMachine;
  else if (mode === 'harvester' && hoveredTile) origin = hoveredTile;
  else {
    const selected = machines.get(selectedMachine);
    if (activePanel === 'generator' && selected?.kind === 'harvester') origin = selected;
  }
  const signature = origin ? `${origin.x},${origin.y}:${mode === 'harvester' && !hoveredMachine ? 'preview' : 'active'}:${zoom}` : '';
  if (signature === lastHarvesterRange) return;
  lastHarvesterRange = signature;
  harvesterRangeLayer.clear();
  if (!origin) return;
  const lineWidth = 1.5 / zoom;
  for (const tile of harvesterTiles(origin)) {
    if (tile.x === origin.x && tile.y === origin.y) continue;
    harvesterRangeLayer.rect(tile.x * cell + 2, tile.y * cell + 2, cell - 4, cell - 4)
      .fill({ color: 0x66d8d2, alpha: 0.1 })
      .stroke({ color: 0x66d8d2, width: lineWidth, alpha: 0.8 });
  }
}
let noticeTimer = 0;
const simulationState = {
  get simulationTime() { return simulationTime; },
  set simulationTime(value: number) { simulationTime = value; },
  get energy() { return energy; },
  set energy(value: number) { energy = value; },
  get ash() { return ash; },
  set ash(value: number) { ash = value; },
};
const machineStatus = createMachineStatus({
  machines,
  selectedMachine: () => selectedMachine,
  powerNetwork,
  heatNetwork: network,
  nutrientNetwork,
  setEnergy: value => { energy = value; },
  ash: () => ash,
  energyCount,
  ashCount,
  researchEnergy,
  cycleLabel,
  cycleTime,
  cycleProgress,
  machineTitle: document.querySelector<HTMLElement>('#machine-title')!,
  generatorStorage: document.querySelector<HTMLElement>('#generator-storage')!,
  bufferCharge: document.querySelector<HTMLElement>('#buffer-charge')!,
  energyBuffer: document.querySelector<HTMLMeterElement>('#energy-buffer')!,
  storageLabel: document.querySelector<HTMLElement>('#storage-label')!,
  cancelConstruction: document.querySelector<HTMLButtonElement>('#cancel-construction')!,
});
const { updateResources, updateGeneratorCycle } = machineStatus;

const networkDrawing = createNetworkDrawing({
  cell,
  rootLayer,
  rootPreview,
  resourceLayer: heatLayer,
  rootBadgeLayer,
  rootBadgeSprites,
  rootQualityTextures,
  networks: [network, powerNetwork, nutrientNetwork],
  heatNetwork: network,
  powerNetwork,
  waterNetwork,
  nutrientNetwork,
  buildingIndex,
  zoom: () => zoom,
  hoveredPoint: () => hoveredPoint,
  hoveredTile: () => hoveredTile,
  rootStart: () => rootStart,
  rootKind: () => rootKind,
  showResources: () => showHeat,
});
const buildingPreview = createBuildingPreview({
  cell,
  rotation: () => buildingRotation,
  mode: () => mode,
  hoveredTile: () => hoveredTile,
  buildingIndex,
  blockedTile: blockedBuildingTile,
  placementPreview,
  rotateButton: document.querySelector<HTMLButtonElement>('#building-rotate')!,
});
const designationUi = createDesignationUi({
  cell,
  designations,
  chunkViews,
  layer: designationLayer,
  drag: () => designationDrag,
  selectedFlower: () => designatedFlower,
  setErasing: erase => { clearingDesignations = erase; },
  status: document.querySelector<HTMLElement>('#designation-status')!,
  clearButton: document.querySelector<HTMLButtonElement>('#clear-designations')!,
  instruction: document.querySelector<HTMLElement>('#designation-instruction')!,
});
const { draw: drawDesignations, updateStatus: updateDesignationStatus, setErase: setDesignationErase } = designationUi;

const plantMovement = new PlantMovement<Flower>({
  plants: () => flowers.values(),
  at: p => { hydrateChunk(world.getChunk(chunkCoordinate(p.x), chunkCoordinate(p.y))); return flowers.get(tileKey(p)); },
  walkable: p => world.getTile(p.x, p.y).terrain === 'land' && !buildingIndex.at(p),
  discover: p => hydrateChunk(world.getChunk(p.x, p.y)),
  resetCycle: flower => {
    flower.growth = 0; flower.updatedAt = simulationTime; flower.cycleStartedAt = simulationTime;
    flower.readyAt = undefined; flower.cycleBoosted = false; flower.growthDuration = randomGrowthDuration();
  },
  relocate: moves => {
    const visuals = moves.map(({plant}) => ({plant, sprite: flowerSprites.get(tileKey(plant)), badge: flowerBadges.get(tileKey(plant)), marker: fertilityMarks.get(tileKey(plant))}));
    for (const {plant} of moves) {
      const key = tileKey(plant);
      flowerSprites.delete(key); flowerBadges.delete(key); fertilityMarks.delete(key);
      const view = chunkViews.get(chunkKey(chunkCoordinate(plant.x), chunkCoordinate(plant.y)));
      if (view) {
        if (!(view.flowers instanceof Set)) view.flowers = new Set(view.flowers);
        view.flowers.delete(key);
      }
    }
    relocatePlants(moves, flowers, world);
    for (const {plant, sprite: oldSprite, badge, marker} of visuals) {
      const key = tileKey(plant), view = chunkViews.get(chunkKey(chunkCoordinate(plant.x), chunkCoordinate(plant.y)));
      if (view) {
        if (!(view.flowers instanceof Set)) view.flowers = new Set(view.flowers);
        const sprite = oldSprite ?? new Sprite(worldTextures.get(plant.id)?.[0]);
        sprite.anchor.set(.5); sprite.position.set((plant.x + .5) * cell, (plant.y + .5) * cell);
        flowerLayer.addChild(sprite); flowerSprites.set(key, sprite); view.flowers.add(key);
        if (badge) { badge.position.set((plant.x + .21) * cell, (plant.y + .79) * cell); flowerLayer.addChild(badge); flowerBadges.set(key, badge); }
        updateFlowerVisual(plant);
      } else { oldSprite?.destroy(); badge?.destroy(); }
      if (marker) { marker.position.set((plant.x + .55) * cell, (plant.y + .55) * cell); marker.visible = !!view; fertilityMarks.set(key, marker); }
    }
  },
}, designations);

const inspectionReadout = createInspectionReadout({
  world,
  flowers,
  heatNetwork: network,
  powerNetwork,
  waterNetwork,
  nutrientNetwork,
  plantMovement,
  qualities,
  tooltip: document.querySelector<HTMLElement>('#tile-tooltip')!,
  rootReadout: document.querySelector<HTMLElement>('#root-readout')!,
  tileReadout,
});

const research = [
  { id: 'field-tools', name: 'Area tools', cost: 100_000, description: 'Unlock drag-area picking.' },
  { id: 'rich-soil', name: 'Rich soil', cost: 16_000, description: 'Unlocks fertilizing with ash.' },
  { id: 'selective-breeding', name: 'Selective breeding', cost: 20_000, repeatable: true, description: 'Each purchase adds 1 percentage point to base improved-quality odds. Cost rises by 1.5× each time.' },
];

const keyAt = (x: number, y: number) => `${x},${y}`;

const panelUi = createPanelUi({
  research,
  researched,
  researchLevels,
  energy: () => energy,
  setActivePanel: panel => { activePanel = panel; },
  researchList,
  inventoryMenu,
  researchMenu,
  generatorMenu,
  inventoryToggle,
  researchToggle,
  fieldNotesView: document.querySelector<HTMLElement>('#field-notes')!,
  showFieldNotes: fieldNotes,
  formatEnergy,
  buyResearch,
});
const { renderResearch, setPanel, setBuildingMenu } = panelUi;

const inventoryUi = createInventoryView({
  inventory,
  machines,
  kinds: itemKinds,
  selectedMachine: () => selectedMachine,
  inventoryView,
  toggleStackCount,
  fuelList,
  fuelCount,
  updateGeneratorCycle,
  notify,
});
const { renderInventory, renderFuel, setupDrag: setupInventoryDrag } = inventoryUi;

function notify(message: string) {
  gameNotice.textContent = message;
  gameNotice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { gameNotice.hidden = true; }, 1800);
}

function prepareHarvest(flower: Flower) {
  prepareFlowerHarvest(flower, { qualities, researchLevels, seed: world.seed });
}

function passiveGrowth(flower: Flower, seconds: number, start: number) {
  advancePassiveGrowth(flower, seconds, start, { seed: world.seed, growSeconds, controlled: plantMovement.isControlled(flower) });
}

function buyResearch(id: string) {
  const tech = research.find((item) => item.id === id);
  if (!tech || (!tech.repeatable && researched.has(id))) return;
  const level = researchLevels.get(id) ?? 0;
  const cost = tech.repeatable ? Math.ceil(tech.cost * 1.5 ** level) : tech.cost;
  if (energy < cost) return;
  if (!spendPower(powerNetwork, cost)) return;
  energy = storedPower(powerNetwork);
  researched.add(id);
  if (tech.repeatable) researchLevels.set(id, level + 1);
  updateToolUnlocks();
  updateFertilizeHelp();
  updateResources();
  renderResearch();
  updateGeneratorCycle();
}

function setMode(nextMode: Mode) {
  worldStroke = null;
  designationDrag = undefined;
  setDesignationErase(false);
  document.querySelector<HTMLElement>('#designation-controls')!.hidden = nextMode !== 'designate';
  mode = nextMode;
  document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => button.classList.remove('active'));
  document.querySelector<HTMLButtonElement>(`#tool-${nextMode === 'uproot' ? 'roots' : nextMode}`)?.classList.add('active');
  rootStart = null;
  rootPreview.clear();
  rootControls.hidden = nextMode !== 'roots' && nextMode !== 'uproot';
  document.querySelector('#root-action-label')!.textContent = 'Roots';
  document.querySelector<HTMLButtonElement>('[data-root-action="uproot"]')?.setAttribute('aria-pressed', String(nextMode === 'uproot'));

  setPanel(null);
  setBuildingMenu(isBuildingMode(nextMode));
  buildingPreview.draw();
  drawDesignations();
  updateHarvesterRange();
}

function cancelAction() {
  cancelInventoryDrag();
  setMode('harvest');
  selectedMachine = '';
  keys.clear();
  hoveredTile = null;
  hoveredPoint = null;
  pointerScreen = null;
  updateHarvesterRange();
  window.clearTimeout(noticeTimer);
  gameNotice.hidden = true;
  drawNetwork();
}

function editRoot(tile: Tile) {
  if (!rootStart) rootStart = tile;
  else if (tileKey(rootStart) === tileKey(tile)) rootStart = null;
  else if (Math.abs(rootStart.x - tile.x) + Math.abs(rootStart.y - tile.y) !== 1) {
    notify('Roots only connect adjacent tiles: north, south, east or west');
  } else {
    const selectedNetwork = rootKind === 'heat' ? network : rootKind === 'utility' ? powerNetwork : nutrientNetwork;
    const paintKey = `${rootKind}:${rootKey(rootStart, tile)}`;
    if (mode !== 'uproot' && paintedRoots.has(paintKey)) { rootStart = tile; return; }
    if (mode === 'uproot') selectedNetwork.remove(rootStart, tile);
    else {
      const result = placePaidRoot(selectedNetwork, rootStart, tile, inventory);
      if (result === 'unaffordable') {
        const existing = selectedNetwork.roots.get(rootKey(rootStart, tile));
        const cost = existing ? rootStats(existing).upgradeCost : 1;
        notify(`This root needs ${cost} Common or better flowers`); return;
      }
      paintedRoots.add(paintKey);
      renderInventory();
      renderFuel();
    }
    rootStart = tile;
    drawNetwork();
  }

  networkDrawing.drawRootPreview();

  buildingPreview.draw();
}

function harvestFlower(tile: Tile, quiet = false, powerSource?: Tile, outputInventory?: Inventory<Stack>): number {
  const flower = flowers.get(tileKey(tile));
  if (!flower) return 0;
  if (plantMovement.isControlled(flower)) return 0;
  if (flower.growth < 1) {
    if (!quiet) notify(`Still growing · ${Math.floor(flower.growth * 100)}%`);
    return 0;
  }
  if (!flower.harvest) prepareHarvest(flower);
  const harvest = flower.harvest!;
  let picked = 0;
  let insufficientEnergy = false;
  const destination = outputInventory ?? inventory;
  while (harvest.qualities.length) {
    const availablePower = powerSource ? powerNetwork.amount(powerSource) : storedPower(powerNetwork);
    if (availablePower < harvesterEnergyPerRoll) { insufficientEnergy = true; break; }
    const quality = harvest.qualities[harvest.qualities.length - 1];
    if (!storeFlower(destination, flower.id, quality, outputInventory?.length ?? inventorySlots)) break;
    if (powerSource) powerNetwork.consume(powerSource, harvesterEnergyPerRoll);
    else spendPower(powerNetwork, harvesterEnergyPerRoll);
    harvest.qualities.pop();
    journal.record({ flower: flower.id, elevation: flower.elevation, watering: flower.watering,
      qualityTier: qualities.indexOf(quality), regrowthSeconds: harvest.loggedGrowth ? undefined : harvest.regrowthSeconds,
      modified: harvest.modified });
    harvest.loggedGrowth = true;
    picked++;
  }
  if (!quiet || picked) {
    if (!outputInventory) renderInventory();
    renderFuel();
  }
  if (picked) {
    energy = storedPower(powerNetwork);
    updateResources();
    renderResearch();
  }
  if (activePanel === 'notes' && picked) fieldNotes();
  if (harvest.qualities.length) {
    if (!powerSource) worldStroke = null;
    if (!quiet) notify(`${picked ? `${picked} picked · ` : ''}${insufficientEnergy ? 'Need 1 kJ per roll' : 'Inventory full'} · ${harvest.qualities.length} rolls remain on this flower`);
    return picked;
  }
  flower.harvest = undefined;
  flower.cycleStartedAt = simulationTime;
  flower.readyAt = undefined;
  flower.cycleBoosted = false;
  flower.growthDuration = randomGrowthDuration();
  flower.growth = 0;
  flower.updatedAt = simulationTime;
  plantMovement.plantAvailabilityChanged();
  updateFlowerVisual(flower);
  if (!quiet) notify(`${picked} ${kinds.find((item) => item.id === flower.id)!.name} picked`);
  return picked;
}

function continueWorldStroke(tile: Tile) {
  const stroke = worldStroke;
  if (!stroke || stroke.mode !== mode) return;
  for (const next of strokeTiles(stroke.last, tile)) {
    if (stroke.mode === 'harvest') {
      harvestFlower(next, true);
      if (!worldStroke) break;
    } else {
      editRoot(next);
      if (!rootStart || tileKey(rootStart) !== tileKey(next)) { worldStroke = null; break; }
    }
  }
  stroke.last = tile;
}

function drawNetwork() {
  inspectionReadout.update(networkDrawing.draw(), hoveredTile);
}

function blockedBuildingTile(tile: Tile) {
  const terrain = world.getTile(tile.x, tile.y);
  return terrain.terrain === 'water' || !!terrain.flower || designations.has(tileKey(tile));
}

const machineSystem = createMachineSystem({
  cell,
  map,
  buildingIndex,
  rotation: () => buildingRotation,
  blockedTile: blockedBuildingTile,
  inventory,
  renderInventory,
  fireFrames: () => fireFrames,
  notify,
  redrawPlacement: buildingPreview.draw,
});
const { addMachine, removeMachine, updateConstructionVisual, updateFireAnimations } = machineSystem;

document.querySelector<HTMLButtonElement>('#cancel-construction')!.addEventListener('click', dismantleSelectedConstruction);

function dismantleSelectedConstruction() {
  const machine = machines.get(selectedMachine);
  const construction = machine?.construction;
  if (!machine || !construction) return;

  const counts = new Map<string, number>();
  for (const material of construction.spentMaterials) counts.set(material.qualityId, (counts.get(material.qualityId) ?? 0) + material.count);
  for (const stack of machine.materials) if (stack) counts.set(stack.quality.id, (counts.get(stack.quality.id) ?? 0) + stack.count);
  const refunds = [...counts].map(([qualityId, count]) => ({ qualityId, count: Math.floor(count / 2) })).filter(refund => refund.count > 0);
  const neededSlots = refunds.reduce((total, refund) => {
    const existing = inventory.filter(stack => stack?.flower === 'greenery' && stack.quality.id === refund.qualityId);
    const room = existing.reduce((sum, stack) => sum + stackLimit - stack!.count, 0);
    return total + Math.ceil(Math.max(0, refund.count - room) / stackLimit);
  }, 0);
  const freeSlots = inventory.filter(stack => !stack).length + Math.max(0, inventorySlots - inventory.length);
  if (neededSlots > freeSlots) { notify('Free inventory space before dismantling this site'); return; }

  for (const refund of refunds) {
    const quality = qualities.find(item => item.id === refund.qualityId)!;
    for (let count = 0; count < refund.count; count++) storeFlower(inventory, 'greenery', quality);
  }
  if (!removeMachine(machine)) return;
  selectedMachine = '';
  renderInventory();
  renderFuel();
  setPanel('inventory');
  notify(`Construction dismantled · ${refunds.reduce((sum, refund) => sum + refund.count, 0)} Greenery returned`);
}

function rotateBuilding() {
  if (!isBuildingMode(mode)) return;
  buildingRotation = ((buildingRotation + 1) % 4) as Rotation;
  buildingPreview.draw();
}

function fertilizeFlower(flower: Flower) {
  const id = keyAt(flower.x, flower.y);
  const level = flower.fertilizer;
  const cap = 5;
  if (level >= cap) { notify('This flower has reached its fertilizer limit'); return; }
  const cost = (level + 1) ** 3;
  if (ash < cost) { notify(`Need ${cost} ash for fertilizer level ${level + 1}`); return; }
  ash -= cost;
  flower.fertilizer++;
  updateFertilizeHelp();
  let marker = fertilityMarks.get(id);
  if (!marker) {
    marker = new Text({ text: '', resolution: Math.max(2.5, (window.devicePixelRatio || 1) * 2.5), style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: 0xffd985, stroke: { color: 0x182016, width: 3 } } });
    marker.position.set((flower.x + 0.55) * cell, (flower.y + 0.55) * cell);
    fertilityMarks.set(id, marker);
    map.addChild(marker);
  }
  marker.text = `+${level + 1}`;
  updateResources();
  notify('Ash applied · improved quality odds on the next harvest');
}

function hydrateChunk(chunk: WorldChunk) {
  const key = chunkKey(chunk.x, chunk.y);
  if (hydratedChunks.has(key)) return;
  hydratedChunks.add(key);
  for (const tile of chunk.tiles) {
    if (!tile.flower || flowers.has(tileKey(tile))) continue;
    const flower: Flower = { uid: nextFlowerUid++, id: tile.flower, x: tile.x, y: tile.y, growth: tile.growth, fertilizer: 0, updatedAt: simulationTime,
      watering: tile.watering, elevation: tile.elevation, growthDuration: randomGrowthDuration(), cycleBoosted: false };
    const duration = growSeconds * flower.growthDuration / environmentGrowth(flower.id, flower.elevation, flower.watering, world.seed);
    Object.assign(flower, initialGrowthTiming(flower.growth, simulationTime, duration));
    flowers.set(tileKey(tile), flower);
  }
}

const worldView = createWorldView({
  app,
  map,
  world,
  camera,
  cell,
  zoom: () => zoom,
  tileDecorationsEnabled: () => zoomRangeToggle.getAttribute('aria-pressed') !== 'true',
  simulationTime: () => simulationTime,
  terrainLayer,
  flowerLayer,
  chunkViews,
  worldTextures,
  overgrowthQualityTextures,
  flowers,
  flowerSprites,
  flowerBadges,
  fertilityMarks,
  hydrateChunk,
  passiveGrowth,
  drawDesignations,
  getPointerScreen: () => pointerScreen,
  setHoveredPoint: point => { hoveredPoint = point; },
  setHoveredTile: tile => { hoveredTile = tile; updateFertilizeHelp(); updateHarvesterRange(); },
  getWorldStroke: () => worldStroke,
  continueWorldStroke,
  getDesignationDrag: () => designationDrag,
  drawRootPreview: networkDrawing.drawRootPreview,
  drawBuildingPreview: buildingPreview.draw,
});
const { updateFlowerVisual, updateCamera } = worldView;

function clearDesignationRectangle(a: Tile, b: Tile) {
  const removed = removeDesignationArea(designations, a, b);
  plantMovement.changed();
  updateDesignationStatus();
  drawDesignations();
  notify(`${removed.length} designations cleared`);
}

function designateRectangle(a: Tile, b: Tile) {
  if ((Math.abs(a.x - b.x) + 1) * (Math.abs(a.y - b.y) + 1) > 4096) {
    notify('Select up to 4096 tiles at a time'); return;
  }
  let added = 0;
  for (const tile of rectangleCells(a, b)) {
    const terrain = world.getTile(tile.x, tile.y);
    if (terrain.terrain === 'water' || buildingIndex.at(tile)) continue;
    designations.set(tileKey(tile), { ...tile, flower: designatedFlower });
    added++;
  }
  plantMovement.changed();
  updateDesignationStatus();
  drawDesignations();
  const targetName = designatedFlower === 'any' ? 'Any flower' : designatedFlower === 'avoid' ? 'Avoid' : kinds.find(k => k.id === designatedFlower)!.name;
  notify(`${added} ${targetName} tiles designated`);
}

async function start() {
  await app.init({ resizeTo: window, background: '#172217', antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
  view.appendChild(app.canvas);


  await Promise.all(kinds.map(async (flower) => {
    const textures = await Promise.all(itemLevelIcons[flower.id].map((icon) => Assets.load<Texture>(icon)));
    worldTextures.set(flower.id, textures);
  }));
  await Promise.all(qualityOrder.map(async (id) => overgrowthQualityTextures.set(id, await Assets.load<Texture>(qualityIcons[id]))));
  rootQualityTextures.push(...qualityOrder.slice(0, 5).map((id) => overgrowthQualityTextures.get(id)!));
  const fireTexture = await Assets.load<Texture>(fireSpritesheetImage);
  fireTexture.source.scaleMode = 'nearest';
  const fireSpritesheet = new Spritesheet(fireTexture, fireSpritesheetData);
  await fireSpritesheet.parse();
  fireFrames = fireSpritesheet.animations.fire;
  app.ticker.add(updateFireAnimations);

  cancelInventoryDrag = setupInventoryDrag();
  map.pivot.set(cell / 2, cell / 2);
  app.stage.addChild(map);
  map.addChild(terrainLayer, designationLayer, rootLayer, heatLayer, flowerLayer, rootBadgeLayer, rootPreview, placementPreview, harvesterRangeLayer);
  updateCamera();
  renderInventory();
  renderFuel();
  renderResearch();
  updateResources();

  bindNavigationControls({
    app,
    camera,
    keys,
    zoom: () => zoom,
    setZoom: value => { zoom = value; },
    zoomReadout,
    zoomRangeToggle,
    updateCamera,
    cancelAction,
    mode: () => mode,
    isBuildingMode,
    rotateBuilding,
    onBlur: () => { worldStroke = null; designationDrag = undefined; drawDesignations(); },
  });

  bindGameControls({
    kinds,
    designationIcons: flowerLevel5Icons,
    simulationSpeed,
    inventoryToggle,
    inventoryMenu,
    researchToggle,
    activePanel: () => activePanel,
    setPanel,
    setMode,
    isUprooting: () => mode === 'uproot',
    setBuildingMenu,
    designatedFlower: () => designatedFlower,
    setDesignatedFlower: flower => { designatedFlower = flower; },
    setDesignationErase,
    isErasingDesignations: () => clearingDesignations,
    rotateBuilding,
    setRootKind: kind => { rootKind = kind; },
    clearRootStart: () => { rootStart = null; },
    clearPaintedRoots: () => paintedRoots.clear(),
    clearWorldStroke: () => { worldStroke = null; },
    drawRootPreview: networkDrawing.drawRootPreview,
    drawBuildingPreview: buildingPreview.draw,
    drawNetwork,
    showResources: () => showHeat,
    setShowResources: show => { showHeat = show; },
  });
  bindSimulationTicker({
    app,
    camera,
    zoom: () => zoom,
    keys,
    state: simulationState,
    world,
    flowers,
    hydrateFlowerTile: tile => hydrateChunk(world.getChunk(chunkCoordinate(tile.x), chunkCoordinate(tile.y))),
    flowerSprites,
    machines,
    network,
    nutrientNetwork,
    powerNetwork,
    waterNetwork,
    plantMovement,
    simulationSpeed,
    kinds: itemKinds,
    qualities,
    research,
    worldStroke: () => worldStroke,
    hoveredTile: () => hoveredTile,
    activePanel: () => activePanel,
    updateCamera,
    notify,
    passiveGrowth,
    harvestFlower,
    updateFlowerVisual,
    updateConstructionVisual,
    drawNetwork,
    updateGeneratorCycle,
    updateResources,
    renderResearch,
    renderFuel,
  });
  bindWorldActions({
    app,
    map,
    cell,
    mode: () => mode,
    rootStart: () => rootStart,
    setRootStart: tile => { rootStart = tile; },
    worldStroke: () => worldStroke,
    setWorldStroke: stroke => { worldStroke = stroke; },
    designationDrag: () => designationDrag,
    setDesignationDrag: drag => { designationDrag = drag; },
    isErasingDesignations: () => clearingDesignations,
    areaPickingUnlocked: () => researched.has('field-tools'),
    setPointerScreen: point => { pointerScreen = point; },
    moveTooltipTo: (x, y) => inspectionReadout.moveToCursor(x, y),
    setHoveredPoint: point => { hoveredPoint = point; },
    setHoveredTile: tile => { hoveredTile = tile; updateFertilizeHelp(); updateHarvesterRange(); },
    buildingIndex,
    isBuildingMode,
    cancelAction,
    drawDesignations,
    drawRootPreview: networkDrawing.drawRootPreview,
    drawBuildingPreview: buildingPreview.draw,
    drawNetwork,
    continueWorldStroke,
    clearDesignationRectangle,
    designateRectangle,
    clearPaintedRoots: () => paintedRoots.clear(),
    editRoot,
    setSelectedMachine: id => { selectedMachine = id; updateHarvesterRange(); },
    tileKey,
    renderFuel,
    setPanel,
    addMachine,
    harvestFlower,
    fertilizeFlower: tile => { const flower = flowers.get(tileKey(tile)); if (flower) fertilizeFlower(flower); },
  });
}

void start();
