import { qualityRank } from './inventory';

export const rootKinds = {
  heat: { name: 'Heat', color: 0xf3a45f, watts: 1000, capacity: 4000, cooling: 0.02, description: 'Heat roots · Lv 1: 50 W → Lv 5: 2.5 kW · 1 Common+ flower/link' },
  utility: { name: 'Water/power', color: 0x61dfe5, watts: 1000, capacity: 4000, cooling: 0.001, description: 'Water roots · shared power (consumers, batteries, generators) · repaint to upgrade water throughput · 1 / 2 / 4 / 8 / 16 Common+ flowers' },
  nutrient: { name: 'Nutrient', color: 0x89d867, watts: 4, capacity: 20, cooling: 0, description: 'Nutrient roots · Lv 1: 0.2/s → Lv 5: 10/s · 1 Common+ flower/link' },
} as const;
export type RootKind = keyof typeof rootKinds;
export type Tile = { x: number; y: number };
export type Root = { a: Tile; b: Tile; kind: RootKind; transported: number; manualLevel?: number; elevationDelta: number };
export const rootLevels = [
  { threshold: 0, multiplier: 0.05 },
  { threshold: 0.25, multiplier: 0.15 },
  { threshold: 2, multiplier: 0.4 },
  { threshold: 8, multiplier: 1 },
  { threshold: 24, multiplier: 2.5 },
] as const;
export function rootStats(root: Root) {
  const experience = root.transported / rootKinds[root.kind].watts;
  let index = root.kind === 'utility' ? Math.max(0, Math.min(4, (root.manualLevel ?? 1) - 1)) : 0;
  if (root.kind !== 'utility') while (index < rootLevels.length - 1 && experience >= rootLevels[index + 1].threshold) index++;
  const next = rootLevels[index + 1];
  return {
    level: index + 1,
    throughput: rootKinds[root.kind].watts * rootLevels[index].multiplier,
    upgradeCost: root.kind === 'utility' && next ? 2 ** (index + 1) : 0,
    progress: root.kind === 'utility' ? next ? 0 : 1 : next ? Math.min(1, (experience - rootLevels[index].threshold) / (next.threshold - rootLevels[index].threshold)) : 1,
    untilNext: root.kind === 'utility' ? 0 : next ? Math.max(0, next.threshold * rootKinds[root.kind].watts - root.transported) : 0,
  };
}
export const tileKey = ({ x, y }: Tile) => `${x},${y}`;
export const rootKey = (a: Tile, b: Tile) => [tileKey(a), tileKey(b)].sort().join('|');

export class RootNetwork {
  readonly roots: Map<string, Root>;
  readonly stored = new Map<string, number>();
  private bodies = new Map<string, { key: string; size: number; capacity: number }>();

  constructor(readonly cols = Infinity, readonly rows = Infinity, readonly kind: RootKind = 'heat', readonly elevation: (tile: Tile) => number = () => 0,
    private readonly resource?: { capacity: number; watts: number; cooling: number; gravity: number; roots?: Map<string, Root> },
    private readonly flowMode: 'proportional' | 'none' = 'proportional') {
    this.roots = resource?.roots ?? new Map<string, Root>();
  }

  canConnect(a: Tile, b: Tile) {
    const unbounded = this.cols === Infinity && this.rows === Infinity;
    return [a, b].every((tile) => Number.isSafeInteger(tile.x) && Number.isSafeInteger(tile.y) && (unbounded || (tile.x >= 0 && tile.y >= 0 && tile.x < this.cols && tile.y < this.rows)))
      && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  }

  connect(a: Tile, b: Tile, kind: RootKind = this.kind) {
    if (kind !== this.kind) return false;
    if (!this.canConnect(a, b)) return false;
    const key = rootKey(a, b);
    if (this.roots.has(key)) return true;
    this.roots.set(key, { a: { ...a }, b: { ...b }, kind, transported: 0, elevationDelta: this.elevation(a) - this.elevation(b) });
    this.componentsCache = undefined;
    return true;
  }

  remove(a: Tile, b: Tile) {
    const removed = this.roots.delete(rootKey(a, b));
    if (removed) this.componentsCache = undefined;
    return removed;
  }

  storageKey(tile: Tile) { return this.bodies.get(tileKey(tile))?.key ?? tileKey(tile); }

  private componentsCache: string[][] | undefined;

  connectedComponents() {
    if (this.componentsCache) return this.componentsCache;
    const adjacent = new Map<string, Set<string>>();
    for (const root of this.roots.values()) {
      const a = this.storageKey(root.a), b = this.storageKey(root.b);
      if (a === b) continue;
      if (!adjacent.has(a)) adjacent.set(a, new Set());
      if (!adjacent.has(b)) adjacent.set(b, new Set());
      adjacent.get(a)!.add(b);
      adjacent.get(b)!.add(a);
    }
    const seen = new Set<string>();
    const components: string[][] = [];
    for (const start of adjacent.keys()) {
      if (seen.has(start)) continue;
      const component: string[] = [], pending = [start];
      seen.add(start);
      while (pending.length) {
        const key = pending.pop()!;
        component.push(key);
        for (const next of adjacent.get(key)!) if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
      }
      components.push(component);
    }
    this.componentsCache = components;
    return components;
  }

  amount(tile: Tile) { return this.stored.get(this.storageKey(tile)) ?? 0; }

  transferRate(root: Root) {
    return rootStats(root).throughput * (this.resource?.watts ?? rootKinds[this.kind].watts) / rootKinds[this.kind].watts;
  }

  bindFootprint(tiles: Tile[], capacity?: number) {
    const unique = new Map(tiles.map((tile) => [tileKey(tile), tile]));
    if (!unique.size || [...unique.values()].some((tile) => !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y)) || [...unique.keys()].some((key) => this.bodies.has(key))) return false;
    const body = { key: unique.keys().next().value!, size: unique.size, capacity: capacity ?? (this.resource?.capacity ?? rootKinds[this.kind].capacity) * unique.size };
    let amount = 0;
    for (const [key] of unique) { amount += this.stored.get(key) ?? 0; this.stored.delete(key); this.bodies.set(key, body); }
    this.stored.set(body.key, amount);
    this.componentsCache = undefined;
    return true;
  }

  capacity(tile: Tile) {
    return this.bodies.get(tileKey(tile))?.capacity ?? this.resource?.capacity ?? rootKinds[this.kind].capacity;
  }

  add(tile: Tile, joules: number) {
    const key = this.storageKey(tile);
    this.stored.set(key, Math.min(this.capacity(tile), (this.stored.get(key) ?? 0) + Math.max(0, joules)));
  }

  consume(tile: Tile, requested: number) {
    const key = this.storageKey(tile);
    const consumed = Math.min(this.stored.get(key) ?? 0, Math.max(0, requested));
    if (consumed) this.stored.set(key, this.stored.get(key)! - consumed);
    return consumed;
  }

  advance(seconds: number) {
    if (this.flowMode === 'none') {
      this.decay(seconds);
      return [];
    }
    const upgraded = new Set<Root>();
    // Small simultaneous steps keep junctions stable and independent of edge insertion order.
    for (let remaining = seconds; remaining > 1e-9;) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      const flows: { from: string; to: string; joules: number; root: Root }[] = [];
      const outgoing = new Map<string, number>();
      const incoming = new Map<string, number>();
      const cooling = new Map<string, number>();
      for (const root of this.roots.values()) {
        const a = this.storageKey(root.a), b = this.storageKey(root.b);
        if (a === b) continue;
        const gravity = root.elevationDelta * (this.resource?.gravity ?? (this.kind === 'nutrient' ? 4 : this.kind === 'heat' ? -4 : 0));
        const difference = (this.stored.get(a) ?? 0) / this.capacity(root.a) - (this.stored.get(b) ?? 0) / this.capacity(root.b) + gravity;
        const from = difference >= 0 ? a : b, to = difference >= 0 ? b : a;
        const rate = this.transferRate(root);
        const joules = Math.min(1, Math.abs(difference)) * rate * dt;
        flows.push({ from, to, joules, root });
        outgoing.set(from, (outgoing.get(from) ?? 0) + joules);
        incoming.set(to, (incoming.get(to) ?? 0) + joules);
        for (const key of [a, b]) cooling.set(key, Math.min(cooling.get(key) ?? 1, (this.resource?.cooling ?? rootKinds[root.kind].cooling)));
      }
      for (const flow of flows) {
        const [x, y] = flow.to.split(',').map(Number);
        const available = this.stored.get(flow.from) ?? 0;
        const space = this.capacity({ x, y }) - (this.stored.get(flow.to) ?? 0);
        const amount = flow.joules * Math.min(1, available / (outgoing.get(flow.from) || 1), space / (incoming.get(flow.to) || 1));
        // Apply deltas after all flow limits have been calculated below.
        flow.joules = amount;
      }
      for (const { from, to, joules, root } of flows) {
        this.stored.set(from, (this.stored.get(from) ?? 0) - joules);
        this.stored.set(to, (this.stored.get(to) ?? 0) + joules);
        const previousLevel = rootStats(root).level;
        root.transported += joules;
        if (rootStats(root).level > previousLevel) upgraded.add(root);
      }
      this.coolStored(dt, cooling);
    }
    return [...upgraded];
  }

  decay(seconds: number) {
    for (let remaining = Math.max(0, seconds); remaining > 1e-9;) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      const cooling = new Map<string, number>();
      for (const root of this.roots.values()) for (const key of [this.storageKey(root.a), this.storageKey(root.b)])
        cooling.set(key, Math.min(cooling.get(key) ?? 1, this.resource?.cooling ?? rootKinds[root.kind].cooling));
      this.coolStored(dt, cooling);
    }
  }

  private coolStored(seconds: number, cooling: Map<string, number>) {
    for (const [key, amount] of this.stored) {
      const cooled = Math.max(0, amount) * Math.exp(-(cooling.get(key) ?? (this.kind === 'utility' ? 0 : rootKinds[this.kind].cooling)) * seconds);
      if (cooled <= 0 || (this.kind === 'heat' && cooled < 0.001)) this.stored.delete(key);
      else this.stored.set(key, cooled);
    }
  }
}

export type PowerBuffer = { tile: Tile; role: 'consumer' | 'battery' | 'producer' };

export function distributePower(network: RootNetwork, buffers: PowerBuffer[]) {
  const components = new Map<number, Set<string>>();
  const componentForNode = new Map<string, number>();
  let nextComponent = 0;
  const addNode = (key: string) => {
    if (componentForNode.has(key)) return componentForNode.get(key)!;
    const id = nextComponent++;
    components.set(id, new Set([key]));
    componentForNode.set(key, id);
    return id;
  };
  for (const nodes of network.connectedComponents()) {
    const id = nextComponent++;
    components.set(id, new Set(nodes));
    for (const key of nodes) componentForNode.set(key, id);
  }
  for (const key of network.stored.keys()) addNode(key);

  const entriesByNode = new Map<string, { tile: Tile; role: PowerBuffer['role']; capacity: number }>();
  for (const buffer of buffers) {
    const key = network.storageKey(buffer.tile);
    entriesByNode.set(key, { tile: buffer.tile, role: buffer.role, capacity: network.capacity(buffer.tile) });
    addNode(key);
  }
  // Preserve any legacy or unassigned node storage as low-priority producer storage.
  for (const nodes of components.values()) for (const key of nodes) {
    if (entriesByNode.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const tile = { x, y };
    entriesByNode.set(key, { tile, role: 'producer', capacity: network.capacity(tile) });
    addNode(key);
  }

  const entriesByComponent = new Map<number, { key: string; tile: Tile; role: PowerBuffer['role']; capacity: number }[]>();
  for (const [key, entry] of entriesByNode) {
    const id = componentForNode.get(key)!;
    const entries = entriesByComponent.get(id) ?? [];
    entries.push({ key, ...entry });
    entriesByComponent.set(id, entries);
  }

  for (const [id, nodes] of components) {
    const energy = [...nodes].reduce((sum, key) => sum + (network.stored.get(key) ?? 0), 0);
    if (energy <= 0) continue;
    for (const key of nodes) network.stored.delete(key);
    let remaining = energy;
    const entries = entriesByComponent.get(id) ?? [];
    // Divide each priority tier by storage capacity, giving peers an equal fill fraction.
    for (const role of ['consumer', 'battery', 'producer'] as const) {
      const receivers = entries.filter(entry => entry.role === role && entry.capacity > 0);
      const capacity = receivers.reduce((sum, entry) => sum + entry.capacity, 0);
      if (!capacity || !remaining) continue;
      const allocated = Math.min(remaining, capacity);
      for (const receiver of receivers) network.add(receiver.tile, allocated * receiver.capacity / capacity);
      remaining -= allocated;
    }
  }
}

export function growWithHeat(growth: number, seconds: number, availableHeat: number, efficiency = 1, limit = 1) {
  const baseGrowth = Math.min(limit - growth, seconds / 12 * efficiency);
  const heatUsed = Math.max(0, Math.min(availableHeat, seconds * 100, (limit - growth - baseGrowth) * 1200 / efficiency));
  return { growth: Math.min(limit, growth + baseGrowth + heatUsed / 1200 * efficiency), heatUsed };
}

export function growWithNutrients(growth: number, seconds: number, available: number, efficiency = 1, limit = 1) {
  const nutrientsUsed = Math.max(0, Math.min(available, seconds, (limit - growth) * 12 / efficiency));
  return { growth: Math.min(limit, growth + nutrientsUsed / 12 * efficiency), nutrientsUsed };
}

type FlowerStack = { quality: { id: string }; count: number };
export function payForRoot(stacks: (FlowerStack | null)[], cost = 1) {
  const eligible = stacks
    .map((stack, index) => ({ stack, index, rank: stack ? qualityRank(stack.quality.id) : -1 }))
    .filter((item): item is { stack: FlowerStack; index: number; rank: number } => !!item.stack && item.rank >= qualityRank('normal'))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  if (eligible.reduce((total, { stack }) => total + stack.count, 0) < cost) return false;
  let remaining = cost;
  for (const { stack, index } of eligible) {
    if (!remaining) break;
    const used = Math.min(remaining, stack.count);
    stack.count -= used; remaining -= used;
    if (stack.count === 0) stacks[index] = null;
  }
  return true;
}

export function placePaidRoot(network: RootNetwork, a: Tile, b: Tile, stacks: (FlowerStack | null)[]) {
  if (!network.canConnect(a, b)) return 'invalid';
  const existing = network.roots.get(rootKey(a, b));
  if (existing) {
    if (network.kind !== 'utility' || rootStats(existing).level === 5) return 'existing';
    if (!payForRoot(stacks, rootStats(existing).upgradeCost)) return 'unaffordable';
    existing.manualLevel = rootStats(existing).level + 1;
    return 'upgraded';
  }
  if (!payForRoot(stacks)) return 'unaffordable';
  network.connect(a, b);
  return 'placed';
}

export function createUtilityNetworks(cols = Infinity, rows = Infinity, elevation: (tile: Tile) => number = () => 0) {
  const power = new RootNetwork(cols, rows, 'utility', elevation, undefined, 'none');
  const water = new RootNetwork(cols, rows, 'utility', elevation, { capacity: 20, watts: 4, cooling: 0, gravity: 0, roots: power.roots });
  return { power, water };
}

export function storedPower(network: RootNetwork) {
  return [...network.stored.values()].reduce((total, amount) => total + amount, 0);
}

export function spendPower(network: RootNetwork, requested: number) {
  if (requested < 0 || !Number.isFinite(requested) || storedPower(network) < requested) return false;
  let remaining = requested;
  for (const key of network.stored.keys()) {
    const [x, y] = key.split(',').map(Number);
    remaining -= network.consume({ x, y }, remaining);
    if (remaining <= 0) break;
  }
  return true;
}

export const burnerFuelWatts = 2000;
export const burnerHeatMultiplier = 1.5;

export function advanceProducer(network: RootNetwork, tile: Tile, remaining: number, rate: number, seconds: number, efficiency = 1) {
  const amount = Math.max(0, Math.min(remaining, Math.max(0, seconds) * rate, (network.capacity(tile) - network.amount(tile)) / efficiency));
  network.add(tile, amount * efficiency);
  return remaining - amount;
}
