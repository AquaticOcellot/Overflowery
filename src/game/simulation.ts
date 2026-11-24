import type { Application, Sprite } from 'pixi.js';
import { advanceConstruction } from '../construction';
import { buildingTiles, burnerSettings } from '../buildings';
import { advanceGenerator, batteryCapacityJoules, generatorCapacityJoules } from '../energy';
import { environmentGrowth, type ChunkWorld } from '../world';
import { simulationSteps } from '../speed';
import { storedPower, tileKey, growWithHeat, growWithNutrients, advanceProducer, distributePower, type PowerBuffer, type Root, type RootNetwork, type Tile } from '../roots';
import type { PlantMovement } from '../plant-movement';
import { startBufferedJob } from './production';
import { harvesterEnergyPerRoll, harvesterTiles } from './harvester';
import type { Inventory } from '../inventory';
import type { Flower, Machine, Panel, Quality, Stack } from './types';

type WorldStroke = { mode: 'harvest' | 'roots' | 'uproot'; last: Tile } | null;
type SimulationOptions = {
  app: Application;
  camera: { x: number; y: number };
  zoom: () => number;
  keys: Set<string>;
  state: { simulationTime: number; energy: number; ash: number };
  world: ChunkWorld;
  flowers: Map<string, Flower>;
  hydrateFlowerTile: (tile: Tile) => void;
  flowerSprites: Map<string, Sprite>;
  machines: Map<string, Machine>;
  network: RootNetwork;
  nutrientNetwork: RootNetwork;
  powerNetwork: RootNetwork;
  waterNetwork: RootNetwork;
  plantMovement: PlantMovement<Flower>;
  simulationSpeed: { multiplier: number };
  kinds: { id: string; name: string }[];
  qualities: Quality[];
  worldStroke: () => WorldStroke;
  hoveredTile: () => Tile | null;
  activePanel: () => Panel;
  updateCamera: () => void;
  notify: (message: string) => void;
  passiveGrowth: (flower: Flower, seconds: number, start: number) => void;
  harvestFlower: (tile: Tile, quiet?: boolean, powerSource?: Tile, outputInventory?: Inventory<Stack>) => number;
  updateFlowerVisual: (flower: Flower) => void;
  updateConstructionVisual: (machine: Machine) => void;
  drawNetwork: () => void;
  updateGeneratorCycle: () => void;
  updateResources: () => void;
  renderResearch: () => void;
  renderFuel: () => void;
};

export function bindSimulationTicker(options: SimulationOptions) {
  const { app, camera, zoom, keys, state, world, flowers, hydrateFlowerTile, flowerSprites, machines, network, nutrientNetwork,
    powerNetwork, waterNetwork, plantMovement, simulationSpeed, kinds, qualities, worldStroke,
    hoveredTile, activePanel, updateCamera, notify, passiveGrowth, harvestFlower, updateFlowerVisual,
    updateConstructionVisual, drawNetwork, updateGeneratorCycle, updateResources, renderResearch, renderFuel } = options;
  let visualTimer = 0;

  app.ticker.add((ticker) => {
    const realSeconds = ticker.deltaMS / 1000;
    const step = ticker.deltaMS / zoom();
    const moving = keys.has('w') || keys.has('s') || keys.has('a') || keys.has('d');
    if (keys.has('w')) camera.y -= step;
    if (keys.has('s')) camera.y += step;
    if (keys.has('a')) camera.x -= step;
    if (keys.has('d')) camera.x += step;
    if (moving) updateCamera();

    const steps = simulationSteps(realSeconds, simulationSpeed.multiplier);
    plantMovement.beginFrame(steps.count);
    const previousEnergy = state.energy;
    let inputChanged = false;
    let completedCount = 0, completedCompost = 0;
    const upgradedRoots = new Set<Root>();
    const changedFlowers = new Set<Flower>();
    const changedConstruction = new Set<Machine>();
    const generators = [...machines.values()].filter((machine) => machine.kind === 'generator');
    // Only flowers on heat/nutrient nodes or under movement control need the
    // substep cadence. Ordinary passive growth is linear and can be advanced
    // once for the whole rendered frame below.
    const steppedFlowers = new Set<Flower>();
    for (const [key] of network.stored) {
      const flower = flowers.get(key);
      if (flower) steppedFlowers.add(flower);
    }
    for (const [key] of nutrientNetwork.stored) {
      const flower = flowers.get(key);
      if (flower) steppedFlowers.add(flower);
    }
    for (const root of network.roots.values()) {
      const a = flowers.get(tileKey(root.a)), b = flowers.get(tileKey(root.b));
      if (a) steppedFlowers.add(a);
      if (b) steppedFlowers.add(b);
    }
    for (const root of nutrientNetwork.roots.values()) {
      const a = flowers.get(tileKey(root.a)), b = flowers.get(tileKey(root.b));
      if (a) steppedFlowers.add(a);
      if (b) steppedFlowers.add(b);
    }
    for (const flower of plantMovement.activePlants()) steppedFlowers.add(flower);
    const processedFlowers = new Set<Flower>();
    for (let tick = 0; tick < steps.count; tick++) {
      const seconds = steps.seconds;
      plantMovement.planTick();
      state.simulationTime += seconds;
      for (const machine of machines.values()) {
        if (machine.construction) {
          const paid = machine.construction.paidFlowers;
          const progress = machine.construction.secondsBuilt;
          const complete = advanceConstruction(machine.construction, machine.materials, seconds) && machine.materials.every(stack => !stack);
          if (machine.construction.paidFlowers !== paid) inputChanged = true;
          if (complete) {
            const footprint = buildingTiles(machine);
            if (machine.kind === 'generator') powerNetwork.bindFootprint(footprint, generatorCapacityJoules);
            if (machine.kind === 'battery') powerNetwork.bindFootprint(footprint, batteryCapacityJoules);
            if (machine.kind === 'harvester') powerNetwork.bindFootprint(footprint);
            if (machine.kind === 'composter') nutrientNetwork.bindFootprint(footprint);
            else if (machine.kind !== 'battery' && machine.kind !== 'harvester') network.bindFootprint(footprint);
            machine.construction = undefined;
            inputChanged = true;
            const name = machine.kind === 'small-burner' ? 'Small burner' : machine.kind === 'burner' ? 'Large burner' : machine.kind === 'generator' ? 'Generator' : machine.kind === 'battery' ? 'Battery' : machine.kind === 'harvester' ? 'Harvester' : 'Composter';
            notify(`${name} construction complete`);
          }
          if (complete || machine.construction?.secondsBuilt !== progress) changedConstruction.add(machine);
        } else inputChanged = startBufferedJob(machine, kinds, qualities) || inputChanged;
      }
      for (const burner of machines.values()) {
        if (burner.job) {
          const power = burnerSettings(burner.kind);
          burner.job.remainingJoules = advanceProducer(network, burner, burner.job.remainingJoules, power.fuelWatts, seconds, power.heatMultiplier);
        }
        if (burner.compost) {
          burner.compost.remaining = advanceProducer(nutrientNetwork, burner, burner.compost.remaining, 2, seconds);
        }
      }
      powerNetwork.advance(seconds);
      waterNetwork.advance(seconds);
      const upgraded = [...network.advance(seconds), ...nutrientNetwork.advance(seconds)];
      for (const root of upgraded) upgradedRoots.add(root);
      const powerBuffers: PowerBuffer[] = [];
      for (const machine of machines.values()) {
        if (machine.construction) continue;
        if (machine.kind === 'harvester') powerBuffers.push({ tile: machine, role: 'consumer' });
        else if (machine.kind === 'battery') powerBuffers.push({ tile: machine, role: 'battery' });
        else if (machine.kind === 'generator') powerBuffers.push({ tile: machine, role: 'producer' });
      }
      distributePower(powerNetwork, powerBuffers);
      for (const generator of generators) {
        const result = advanceGenerator(network.amount(generator), powerNetwork.amount(generator), seconds);
        network.consume(generator, result.heatUsed);
        powerNetwork.add(generator, result.heatUsed);
      }
      distributePower(powerNetwork, powerBuffers);
      state.energy = storedPower(powerNetwork);
      const stroke = worldStroke();
      const hover = hoveredTile();
      if (stroke?.mode === 'harvest' && hover) {
        const hoveredFlower = flowers.get(tileKey(hover));
        if (hoveredFlower) steppedFlowers.add(hoveredFlower);
      }
      for (const flower of steppedFlowers) {
        const elapsed = Math.max(0, state.simulationTime - flower.updatedAt);
        const activeSeconds = Math.min(seconds, elapsed);
        passiveGrowth(flower, Math.max(0, elapsed - seconds), flower.updatedAt);
        flower.updatedAt = state.simulationTime;
        if (flower.harvest) { changedFlowers.add(flower); processedFlowers.add(flower); continue; }
        const previousGrowth = flower.growth;
        const growthLimit = plantMovement.isControlled(flower) ? 1 : Infinity;
        const growthRate = environmentGrowth(flower.id, flower.elevation, flower.watering, world.seed) / flower.growthDuration;
        const result = growWithHeat(flower.growth, activeSeconds, network.amount(flower), growthRate, growthLimit);
        network.consume(flower, result.heatUsed);
        const fed = growWithNutrients(result.growth, activeSeconds, nutrientNetwork.amount(flower), growthRate, growthLimit);
        nutrientNetwork.consume(flower, fed.nutrientsUsed);
        flower.cycleBoosted ||= result.heatUsed > 0 || fed.nutrientsUsed > 0;
        if (result.heatUsed === 0 && fed.nutrientsUsed === 0) {
          passiveGrowth(flower, activeSeconds, state.simulationTime - activeSeconds);
        } else {
          if (previousGrowth < 1 && fed.growth >= 1) flower.readyAt = state.simulationTime - activeSeconds + activeSeconds * (1 - previousGrowth) / (fed.growth - previousGrowth);
          flower.growth = Math.min(plantMovement.isControlled(flower) ? 1 : Infinity, fed.growth);
        }
        changedFlowers.add(flower);
        processedFlowers.add(flower);
      }
      plantMovement.step();
      for (const flower of plantMovement.activePlants()) steppedFlowers.add(flower);
      if (stroke?.mode === 'harvest' && hover && (flowers.get(tileKey(hover))?.growth ?? 0) >= 1) harvestFlower(hover, true);

      for (const harvester of machines.values()) {
        if (harvester.kind !== 'harvester' || harvester.construction || !harvester.output || powerNetwork.amount(harvester) < harvesterEnergyPerRoll) continue;
        for (const tile of harvesterTiles(harvester)) {
          hydrateFlowerTile(tile);
          const flower = flowers.get(tileKey(tile));
          if (!flower) continue;
          const elapsed = Math.max(0, state.simulationTime - flower.updatedAt);
          if (elapsed > 0) {
            passiveGrowth(flower, elapsed, flower.updatedAt);
            flower.updatedAt = state.simulationTime;
            changedFlowers.add(flower);
          }
          if (flower.growth < 1 || plantMovement.isControlled(flower)) continue;
          if (powerNetwork.amount(harvester) < harvesterEnergyPerRoll) break;
          if (!harvestFlower(tile, true, harvester, harvester.output)) break;
        }
      }

      for (const burner of machines.values()) {
        if (burner.compost && burner.compost.remaining <= 0) { burner.compost = undefined; completedCompost++; }
        if (!burner.job) continue;
        if (burner.job.remainingJoules <= 0) {
          completedCount++;
          state.ash++;
          burner.job = undefined;
        }
      }
    }
    // Passive growth has no intermediate events, so advancing it once over the
    // frame preserves its timing while avoiding a full visible-flower scan per
    // simulation substep at high speed.
    const controlledFlowers = new Set(plantMovement.activePlants());
    for (const key of flowerSprites.keys()) {
      const flower = flowers.get(key);
      if (!flower || processedFlowers.has(flower) || controlledFlowers.has(flower)) continue;
      const elapsed = Math.max(0, state.simulationTime - flower.updatedAt);
      passiveGrowth(flower, elapsed, flower.updatedAt);
      flower.updatedAt = state.simulationTime;
      changedFlowers.add(flower);
    }
    for (const machine of changedConstruction) updateConstructionVisual(machine);
    for (const flower of changedFlowers) updateFlowerVisual(flower);
    const refreshPanels = visualTimer + realSeconds >= 0.1;
    visualTimer += realSeconds;
    if (visualTimer >= .1) { drawNetwork(); visualTimer = 0; }
    if (upgradedRoots.size) notify(`${upgradedRoots.size} roots leveled up!`);
    if (activePanel() === 'generator') updateGeneratorCycle();
    if (state.energy !== previousEnergy || completedCount) {
      updateResources();
      if (activePanel() === 'research' && refreshPanels) renderResearch();
    }
    if (inputChanged || completedCount || completedCompost) {
      renderFuel();
      if (completedCount || completedCompost) notify(completedCount ? `Burn complete · +${completedCount} ash` : 'Composting complete · nutrients delivered');
    }
  });
}
