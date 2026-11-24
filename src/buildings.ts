export const buildingTypes = {
  'small-burner': { width: 1, height: 1 },
  burner: { width: 3, height: 2 },
  generator: { width: 1, height: 1 },
  battery: { width: 2, height: 1 },
  composter: { width: 1, height: 1 },
  harvester: { width: 1, height: 1 },
} as const;
export type BuildingKind = keyof typeof buildingTypes;
export type Rotation = 0 | 1 | 2 | 3;
export type BuildingFootprint = { x: number; y: number; kind: BuildingKind; rotation: Rotation };
type Tile = { x: number; y: number };
const keyAt = (tile: Tile) => `${tile.x},${tile.y}`;

export function buildingSize(kind: BuildingKind, rotation: Rotation) {
  const size = buildingTypes[kind];
  return rotation % 2 ? { width: size.height, height: size.width } : { ...size };
}

export function buildingTiles(building: BuildingFootprint) {
  const { width, height } = buildingSize(building.kind, building.rotation);
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) tiles.push({ x: building.x + x, y: building.y + y });
  return tiles;
}

export class BuildingIndex<T extends BuildingFootprint> {
  readonly buildings = new Map<string, T>();
  private occupied = new Map<string, string>();

  at(tile: Tile) {
    const id = this.occupied.get(keyAt(tile));
    return id === undefined ? undefined : this.buildings.get(id);
  }

  blockedTiles(building: BuildingFootprint, blocked: (tile: Tile) => boolean) {
    return buildingTiles(building).filter((tile) => this.occupied.has(keyAt(tile)) || blocked(tile));
  }

  place(building: T, blocked: (tile: Tile) => boolean) {
    if (!Number.isInteger(building.rotation) || building.rotation < 0 || building.rotation > 3 || buildingTiles(building).some((tile) => !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y)) || this.blockedTiles(building, blocked).length) return false;
    const id = keyAt(building);
    this.buildings.set(id, building);
    for (const tile of buildingTiles(building)) this.occupied.set(keyAt(tile), id);
    return true;
  }

  remove(building: T) {
    const id = keyAt(building);
    if (this.buildings.get(id) !== building) return false;
    this.buildings.delete(id);
    for (const tile of buildingTiles(building)) this.occupied.delete(keyAt(tile));
    return true;
  }
}

export function burnerSettings(kind: BuildingKind) {
  return kind === 'small-burner' ? { fuelWatts: 1000, heatMultiplier: 1 } : { fuelWatts: 2000, heatMultiplier: 1.5 };
}
