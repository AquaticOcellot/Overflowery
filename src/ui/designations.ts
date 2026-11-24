import { chunkCoordinate, chunkKey } from '../world';
import type { Designation, DesignationFlower } from '../designations';
import type { FlowerId } from '../game/types';
import type { Graphics } from 'pixi.js';

type Tile = { x: number; y: number };
type Drag = { start: Tile; end: Tile; erase: boolean } | undefined;
type DesignationUiOptions = {
  cell: number;
  designations: Map<string, Designation>;
  chunkViews: { has(key: string): boolean };
  layer: Graphics;
  drag: () => Drag;
  selectedFlower: () => DesignationFlower;
  setErasing: (erase: boolean) => void;
  status: HTMLElement;
  clearButton: HTMLButtonElement;
  instruction: HTMLElement;
};

const colors: Record<FlowerId, number> = {
  blue: 0x74b8ff,
  yellow: 0xffd36e,
  purple: 0xd691ec,
  red: 0xf18080,
};
const anyColor = 0xffffff;
const avoidColor = 0x000000;

function designationColor(flower: DesignationFlower) {
  return flower === 'any' ? anyColor : flower === 'avoid' ? avoidColor : colors[flower as FlowerId];
}

export function createDesignationUi(options: DesignationUiOptions) {
  const { cell, designations, chunkViews, layer, drag, selectedFlower, setErasing, status, clearButton, instruction } = options;

  function draw() {
    layer.clear();
    for (const target of designations.values()) {
      if (!chunkViews.has(chunkKey(chunkCoordinate(target.x), chunkCoordinate(target.y)))) continue;
      const color = designationColor(target.flower);
      layer.rect(target.x * cell + 3, target.y * cell + 3, cell - 6, cell - 6)
        .fill({ color, alpha: .07 }).stroke({ color, alpha: .6, width: 1 });
    }
    const activeDrag = drag();
    if (activeDrag) {
      const { start: a, end: b } = activeDrag;
      const color = activeDrag.erase ? 0xe77878 : designationColor(selectedFlower());
      layer.rect(Math.min(a.x, b.x) * cell, Math.min(a.y, b.y) * cell,
        (Math.abs(a.x - b.x) + 1) * cell, (Math.abs(a.y - b.y) + 1) * cell)
        .fill({ color, alpha: .16 }).stroke({ color, width: 2 });
    }
  }

  function updateStatus() {
    status.textContent = `${designations.size} designated tiles`;
  }

  function setErase(erase: boolean) {
    setErasing(erase);
    clearButton.setAttribute('aria-pressed', String(erase));
    instruction.textContent = erase ? 'Drag a rectangle to clear its designations.' : 'Drag a rectangle to designate planting tiles.';
  }

  return { draw, updateStatus, setErase };
}
