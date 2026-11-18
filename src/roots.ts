export const rootKinds = {
  heat: { name: 'Heat', color: 0xf3a45f, watts: 1000, capacity: 4000, cooling: 0.02, description: 'Heat roots · 1 kW transfer · 1 Common flower per link' },
  nutrient: { name: 'Nutrient', color: 0x89d867, watts: 4, capacity: 20, cooling: 0, description: 'Nutrient roots · 4 nutrients/s · 1 Common flower per link' },
} as const;
export type RootKind = keyof typeof rootKinds;
export type Tile = { x: number; y: number };
export type Root = { a: Tile; b: Tile; kind: RootKind };
export const tileKey = ({ x, y }: Tile) => `${x},${y}`;
export const rootKey = (a: Tile, b: Tile) => [tileKey(a), tileKey(b)].sort().join('|');

export class RootNetwork {
  readonly roots = new Map<string, Root>();
  readonly stored = new Map<string, number>();

  constructor(readonly cols: number, readonly rows: number, readonly kind: RootKind = 'heat') {}

  canConnect(a: Tile, b: Tile) {
    return [a, b].every((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) && tile.x >= 0 && tile.y >= 0 && tile.x < this.cols && tile.y < this.rows)
      && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  }

  connect(a: Tile, b: Tile, kind: RootKind = this.kind) {
    if (kind !== this.kind) return false;
    if (!this.canConnect(a, b)) return false;
    this.roots.set(rootKey(a, b), { a: { ...a }, b: { ...b }, kind });
    return true;
  }

  remove(a: Tile, b: Tile) {
    const removed = this.roots.delete(rootKey(a, b));
    return removed;
  }

  capacity(_tile: Tile) {
    return rootKinds[this.kind].capacity;
  }

  add(tile: Tile, joules: number) {
    const key = tileKey(tile);
    this.stored.set(key, Math.min(this.capacity(tile), (this.stored.get(key) ?? 0) + Math.max(0, joules)));
  }

  consume(tile: Tile, requested: number) {
    const key = tileKey(tile);
    const consumed = Math.min(this.stored.get(key) ?? 0, Math.max(0, requested));
    if (consumed) this.stored.set(key, this.stored.get(key)! - consumed);
    return consumed;
  }

  advance(seconds: number) {
    // Small simultaneous steps keep junctions stable and independent of edge insertion order.
    for (let remaining = seconds; remaining > 1e-9;) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      const flows: { from: string; to: string; joules: number }[] = [];
      const outgoing = new Map<string, number>();
      const incoming = new Map<string, number>();
      const cooling = new Map<string, number>();
      for (const root of this.roots.values()) {
        const a = tileKey(root.a), b = tileKey(root.b);
        const difference = (this.stored.get(a) ?? 0) / this.capacity(root.a) - (this.stored.get(b) ?? 0) / this.capacity(root.b);
        const from = difference >= 0 ? a : b, to = difference >= 0 ? b : a;
        const joules = Math.abs(difference) * rootKinds[root.kind].watts * dt;
        flows.push({ from, to, joules });
        outgoing.set(from, (outgoing.get(from) ?? 0) + joules);
        incoming.set(to, (incoming.get(to) ?? 0) + joules);
        for (const key of [a, b]) cooling.set(key, Math.min(cooling.get(key) ?? 1, rootKinds[root.kind].cooling));
      }
      for (const flow of flows) {
        const [x, y] = flow.to.split(',').map(Number);
        const available = this.stored.get(flow.from) ?? 0;
        const space = this.capacity({ x, y }) - (this.stored.get(flow.to) ?? 0);
        const amount = flow.joules * Math.min(1, available / (outgoing.get(flow.from) || 1), space / (incoming.get(flow.to) || 1));
        // Apply deltas after all flow limits have been calculated below.
        flow.joules = amount;
      }
      for (const { from, to, joules } of flows) {
        this.stored.set(from, (this.stored.get(from) ?? 0) - joules);
        this.stored.set(to, (this.stored.get(to) ?? 0) + joules);
      }
      for (const [key, heat] of this.stored) {
        const cooled = Math.max(0, heat) * Math.exp(-(cooling.get(key) ?? rootKinds[this.kind].cooling) * dt);
        if (cooled <= 0 || (this.kind === 'heat' && cooled < 0.001)) this.stored.delete(key);
        else this.stored.set(key, cooled);
      }
    }
  }
}

export function growWithHeat(growth: number, seconds: number, availableHeat: number) {
  const baseGrowth = Math.min(1 - growth, seconds / 12);
  const heatUsed = Math.max(0, Math.min(availableHeat, seconds * 100, (1 - growth - baseGrowth) * 1200));
  return { growth: Math.min(1, growth + baseGrowth + heatUsed / 1200), heatUsed };
}

export function growWithNutrients(growth: number, seconds: number, available: number) {
  const nutrientsUsed = Math.max(0, Math.min(available, seconds, (1 - growth) * 12));
  return { growth: Math.min(1, growth + nutrientsUsed / 12), nutrientsUsed };
}

type FlowerStack = { quality: { id: string }; count: number };
export function payForRoot(stacks: FlowerStack[]) {
  const index = stacks.findIndex((stack) => stack.quality.id === 'normal' && stack.count > 0);
  if (index < 0) return false;
  if (--stacks[index].count === 0) stacks.splice(index, 1);
  return true;
}

export function placePaidRoot(network: RootNetwork, a: Tile, b: Tile, stacks: FlowerStack[]) {
  if (!network.canConnect(a, b)) return 'invalid';
  if (network.roots.has(rootKey(a, b))) return 'existing';
  if (!payForRoot(stacks)) return 'unaffordable';
  network.connect(a, b);
  return 'placed';
}

export function advanceProducer(network: RootNetwork, tile: Tile, remaining: number, rate: number, seconds: number) {
  const amount = Math.max(0, Math.min(remaining, Math.max(0, seconds) * rate, network.capacity(tile) - (network.stored.get(tileKey(tile)) ?? 0)));
  network.add(tile, amount);
  return remaining - amount;
}
