import type { Position } from './plant-routing';
export type LocatedPlant = Position & {
    id: string;
    watering: number;
    elevation: number;
};
type Tile = Position & {
    flower?: string;
    growth: number;
    watering: number;
    elevation: number;
    terrain: string;
};
const key = (p: Position) => `${p.x},${p.y}`;
// Validate first, remove all sources, then write all destinations. Swaps never
// overwrite an occupant, duplicate a plant, or leave stale world tile flowers.
export function relocatePlants<T extends LocatedPlant>(moves: {
    plant: T;
    to: Position;
}[], plants: Map<string, T>, world: {
    getTile(x: number, y: number): Tile;
}) {
    const sources = new Set(moves.map(m => key(m.plant))), destinations = new Set(moves.map(m => key(m.to)));
    if (sources.size !== moves.length || destinations.size !== moves.length)
        throw new Error('Duplicate plant transaction');
    for (const move of moves) {
        const tile = world.getTile(move.to.x, move.to.y);
        if (plants.get(key(move.plant)) !== move.plant || tile.terrain !== 'land' || (tile.flower && !sources.has(key(move.to))))
            throw new Error('Invalid plant transaction');
    }
    const changes = moves.map(m => ({ ...m, from: { x: m.plant.x, y: m.plant.y } }));
    for (const { from } of changes) {
        plants.delete(key(from));
        world.getTile(from.x, from.y).flower = undefined;
        world.getTile(from.x, from.y).growth = 0;
    }
    for (const { plant, to } of changes) {
        const tile = world.getTile(to.x, to.y);
        Object.assign(plant, to, { watering: tile.watering, elevation: tile.elevation });
        tile.flower = plant.id;
        tile.growth = 0;
        plants.set(key(plant), plant);
    }
    return changes;
}
