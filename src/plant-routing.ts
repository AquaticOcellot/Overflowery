import { chunkSize } from './world';

export type Position = {
    x: number;
    y: number;
};
export const positionKey = (p: Position) => `${p.x},${p.y}`;
export const orthogonalDistance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// Terrain-only routes remain stable when flowers temporarily occupy their cells.
// Each yield accounts for one expanded node, allowing frame-budgeted planning.
export function* routeSearch(start: Position, goal: Position, walkable: (p: Position) => boolean, limit = 8192): Generator<void, Position[] | undefined> {
    if (!walkable(goal))
        return;
    type Node = Position & {
        cost: number;
        score: number;
        parent?: Node;
    };
    const heap: Node[] = [];
    const push = (n: Node) => {
        heap.push(n);
        let i = heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heap[parent].score <= n.score)
                break;
            heap[i] = heap[parent];
            i = parent;
        }
        heap[i] = n;
    };
    const pop = () => {
        const n = heap[0], last = heap.pop()!;
        if (heap.length) {
            let i = 0;
            while (i * 2 + 1 < heap.length) {
                let c = i * 2 + 1;
                if (c + 1 < heap.length && heap[c + 1].score < heap[c].score)
                    c++;
                if (last.score <= heap[c].score)
                    break;
                heap[i] = heap[c];
                i = c;
            }
            heap[i] = last;
        }
        return n;
    };
    const path = (n: Node) => { const result: Position[] = []; while (n.parent) {
        result.push({ x: n.x, y: n.y });
        n = n.parent;
    } return result.reverse(); };
    const costs = new Map([[positionKey(start), 0]]);
    push({ ...start, cost: 0, score: orthogonalDistance(start, goal) });
    let closest: Node | undefined;
    for (let visited = 0; heap.length && visited < limit; visited++) {
        const current = pop();
        if (current.cost !== costs.get(positionKey(current)))
            continue;
        if (!closest || orthogonalDistance(current, goal) < orthogonalDistance(closest, goal))
            closest = current;
        if (orthogonalDistance(current, goal) === 0)
            return path(current);
        for (const [dx, dy] of directions) {
            const next = { x: current.x + dx, y: current.y + dy }, cost = current.cost + 1;
            if (cost >= (costs.get(positionKey(next)) ?? Infinity) || !walkable(next))
                continue;
            costs.set(positionKey(next), cost);
            push({ ...next, cost, score: cost + orthogonalDistance(next, goal), parent: current });
        }
        yield;
    }
    // Long routes can advance in chunks, but each partial route must make progress.
    if (heap.length && closest && orthogonalDistance(closest, goal) < orthogonalDistance(start, goal))
        return path(closest);
}
export function* vacancySearch(start: Position, walkable: (p: Position) => boolean, acceptable: (p: Position) => boolean, limit = 8192): Generator<void, Position | undefined> {
    const queue: Position[] = [{ ...start }], seen = new Set([positionKey(start)]);
    for (let head = 0; head < queue.length && head < limit; head++) {
        const p = queue[head];
        if (head > 0 && acceptable(p))
            return p;
        for (const [dx, dy] of directions) {
            const next = { x: p.x + dx, y: p.y + dy }, key = positionKey(next);
            if (seen.has(key))
                continue;
            seen.add(key);
            if (walkable(next))
                queue.push(next);
        }
        yield;
    }
}
export function* discoveryRings(cells: Position[], size = chunkSize): Generator<Position | {
    distanceBound: number;
}, never> {
    const minX = Math.min(...cells.map(p => p.x)), maxX = Math.max(...cells.map(p => p.x));
    const minY = Math.min(...cells.map(p => p.y)), maxY = Math.max(...cells.map(p => p.y));
    for (let ring = 0;; ring++) {
        const left = Math.floor(minX / size) - ring, right = Math.floor(maxX / size) + ring;
        const top = Math.floor(minY / size) - ring, bottom = Math.floor(maxY / size) + ring;
        for (let y = top; y <= bottom; y++)
            for (let x = left; x <= right; x++)
                if (!ring || x === left || x === right || y === top || y === bottom)
                    yield { x, y };
        yield { distanceBound: Math.min(minX - left * size + 1, (right + 1) * size - maxX, minY - top * size + 1, (bottom + 1) * size - maxY) };
    }
}
