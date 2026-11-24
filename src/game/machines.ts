import { AnimatedSprite, Container, Graphics, Text, type Texture, type Ticker } from 'pixi.js';
import { createConstruction, burnerConstructionCost } from '../construction';
import { buildingSize, type BuildingIndex, type Rotation } from '../buildings';
import { hasQualityFlowers, machineInputSlots, payQualityFlowers, type Inventory } from '../inventory';
import type { Tile } from '../roots';
import { iconMarkup } from '../icons';
import { harvesterInventorySlots } from './harvester';
import type { Machine, MachineKind, Stack } from './types';

type ConstructionView = { body: Container; overlay: Graphics; label: Text; width: number; height: number };
type MachineOptions = {
  cell: number;
  map: Container;
  buildingIndex: BuildingIndex<Machine>;
  rotation: () => Rotation;
  blockedTile: (tile: Tile) => boolean;
  inventory: Inventory<Stack>;
  renderInventory: () => void;
  fireFrames: () => Texture[];
  notify: (message: string) => void;
  redrawPlacement: () => void;
};

export function createMachineSystem(options: MachineOptions) {
  const { cell, map, buildingIndex, rotation, blockedTile, inventory, renderInventory, fireFrames, notify, redrawPlacement } = options;
  const constructionViews = new Map<Machine, ConstructionView>();
  const fireAnimations = new Set<AnimatedSprite>();
  const machineViews = new Map<Machine, Container>();
  const machineAnimations = new Map<Machine, AnimatedSprite[]>();

  function updateFireAnimations(ticker: Ticker) {
    for (const animation of fireAnimations) animation.update(ticker);
  }

  function updateConstructionVisual(machine: Machine) {
    const view = constructionViews.get(machine);
    if (!view) return;
    if (!machine.construction) {
      view.body.alpha = 1;
      view.overlay.destroy();
      view.label.destroy();
      constructionViews.delete(machine);
      return;
    }
    const progress = Math.min(1, machine.construction.secondsBuilt / machine.construction.durationSeconds);
    view.body.alpha = 0.2 + progress * 0.65;
    view.overlay.clear().roundRect(-view.width / 2, -view.height / 2, view.width, view.height, 8).stroke({ color: 0x7ebacb, width: 2 });
    view.overlay.rect(-view.width / 2 + 6, view.height / 2 - 10, (view.width - 12) * progress, 4).fill(0x9de0dc);
    view.label.text = `${Math.floor(progress * 100)}%`;
  }

  function addMachine(x: number, y: number, kind: MachineKind) {
    const commonCost = kind === 'burner' ? 0 : 10;
    if (commonCost && !hasQualityFlowers(inventory, 'normal', commonCost)) {
      notify(`Need ${commonCost} Common flowers to place this building`);
      return;
    }
    const construction = kind === 'burner' ? createConstruction(burnerConstructionCost, burnerConstructionCost) : createConstruction();
    if (commonCost) construction.spentMaterials.push({ qualityId: 'normal', count: commonCost });
    const data: Machine = {
      x, y, kind, rotation: rotation(), input: Array(machineInputSlots).fill(null), materials: Array(machineInputSlots).fill(null),
      output: kind === 'harvester' ? Array(harvesterInventorySlots).fill(null) : undefined,
      construction,
    };
    if (!buildingIndex.place(data, blockedTile)) {
      notify('The entire footprint needs empty, dry ground');
      return;
    }
    if (commonCost) {
      payQualityFlowers(inventory, 'normal', commonCost);
      renderInventory();
    }
    const { width, height } = buildingSize(kind, data.rotation);
    const machine = new Container();
    machine.position.set((x + width / 2) * cell, (y + height / 2) * cell);
    const color = kind === 'composter' ? 0x89d867 : kind === 'generator' ? 0xead16a : kind === 'harvester' ? 0x66d8d2 : 0xffad62;
    const w = width * cell - 8, h = height * cell - 8;
    const body = new Container();
    const animations: AnimatedSprite[] = [];
    const isBurner = kind === 'burner' || kind === 'small-burner';
    const frames = isBurner ? fireFrames() : [];
    if (frames.length) {
      const fire = new AnimatedSprite({ textures: frames, autoUpdate: false });
      const fireSize = kind === 'small-burner' ? 44 : 88;
      fire.anchor.set(0.5);
      fire.position.set(0);
      fire.width = fireSize;
      fire.height = fireSize;
      fire.animationSpeed = 0.2;
      fire.loop = true;
      fire.play();
      body.addChild(fire);
      fireAnimations.add(fire);
      animations.push(fire);
    } else {
      const base = new Graphics().roundRect(-w / 2, -h / 2, w, h, 8).fill(0x34291f).stroke({ color, width: 2 });
      if (kind === 'burner') {
        base.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 5).fill(0x201b16).stroke({ color: 0x67452d, width: 2 });
        for (let i = 0; i < 3; i++) base.moveTo(-w / 2 + 15, h / 2 - 17 - i * 5).lineTo(-w / 2 + 30, h / 2 - 17 - i * 5).stroke({ color, width: 2 });
      }
      const symbol = new Graphics().svg(iconMarkup(kind === 'small-burner' ? 'burner' : kind, `#${color.toString(16).padStart(6, '0')}`));
      symbol.scale.set(kind === 'burner' ? 1.7 : 1);
      symbol.pivot.set(12, 12);
      symbol.rotation = data.rotation * Math.PI / 2;
      body.addChild(base, symbol);
    }
    machine.addChild(body);
    if (data.construction) {
      const overlay = new Graphics();
      const label = new Text({ text: '0%', resolution: Math.max(2, (window.devicePixelRatio || 1) * 2.5), style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fill: 0xc6e9ee } });
      label.anchor.set(0.5);
      label.position.set(0, h / 2 - 22);
      machine.addChild(overlay, label);
      constructionViews.set(data, { body, overlay, label, width: w, height: h });
      updateConstructionVisual(data);
    }
    map.addChild(machine);
    machineViews.set(data, machine);
    machineAnimations.set(data, animations);
    redrawPlacement();
  }

  function removeMachine(machine: Machine) {
    if (!machine.construction || !buildingIndex.remove(machine)) return false;
    for (const animation of machineAnimations.get(machine) ?? []) fireAnimations.delete(animation);
    machineAnimations.delete(machine);
    constructionViews.delete(machine);
    const view = machineViews.get(machine);
    if (view?.parent) view.parent.removeChild(view);
    view?.destroy({ children: true });
    machineViews.delete(machine);
    redrawPlacement();
    return true;
  }

  return { addMachine, removeMachine, updateConstructionVisual, updateFireAnimations };
}
