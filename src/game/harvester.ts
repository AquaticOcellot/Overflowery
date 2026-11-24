import type { Tile } from '../roots';

export const harvesterEnergyPerRoll = 1_000;
export const harvesterInventorySlots = 12;

export function harvesterTiles(origin: Tile) {
  const tiles: Tile[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
    tiles.push({ x: origin.x + dx, y: origin.y + dy });
  }
  return tiles;
}
