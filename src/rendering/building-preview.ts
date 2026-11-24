import { buildingSize, buildingTiles, type BuildingIndex } from '../buildings';
import type { Machine, MachineKind, Mode } from '../game/types';
import type { Rotation } from '../buildings';
import type { Tile } from '../roots';
import { iconMarkup } from '../icons';
import type { Graphics } from 'pixi.js';

type BuildingPreviewOptions = {
  cell: number;
  rotation: () => Rotation;
  mode: () => Mode;
  hoveredTile: () => Tile | null;
  buildingIndex: BuildingIndex<Machine>;
  blockedTile: (tile: Tile) => boolean;
  placementPreview: Graphics;
  rotateButton: HTMLButtonElement;
};

export function isBuildingMode(value: Mode): value is MachineKind {
  return value === 'small-burner' || value === 'burner' || value === 'generator' || value === 'battery' || value === 'composter' || value === 'harvester';
}

export function createBuildingPreview(options: BuildingPreviewOptions) {
  const { cell, rotation, mode, hoveredTile, buildingIndex, blockedTile, placementPreview, rotateButton } = options;

  function draw() {
    placementPreview.clear();
    const currentMode = mode();
    const currentRotation = rotation();
    rotateButton.hidden = !isBuildingMode(currentMode);
    if (!isBuildingMode(currentMode)) return;
    const size = buildingSize(currentMode, currentRotation);
    rotateButton.innerHTML = `${iconMarkup('rotate')}<span>${size.width}×${size.height}</span>`;
    const tile = hoveredTile();
    if (!tile) return;
    const candidate = { ...tile, kind: currentMode, rotation: currentRotation };
    const blocked = new Set(buildingIndex.blockedTiles(candidate, blockedTile).map((p) => `${p.x},${p.y}`));
    const valid = blocked.size === 0;
    for (const covered of buildingTiles(candidate)) {
      const color = blocked.has(`${covered.x},${covered.y}`) ? 0xe36666 : valid ? 0xaed97b : 0xc8ad6b;
      placementPreview.rect(covered.x * cell + 2, covered.y * cell + 2, cell - 4, cell - 4)
        .fill({ color, alpha: 0.18 }).stroke({ color, width: 2 });
    }
  }

  return { draw };
}
