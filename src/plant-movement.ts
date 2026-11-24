import { PlantReservations, swapAllowed, precedes, type Reservation } from './plant-reservations';
import { positionKey, orthogonalDistance, routeSearch, vacancySearch, discoveryRings, type Position } from './plant-routing';
const frameWorkBudgetMs = 3;
const planningSliceMs = 1;
// Faster simulation gets more planning slices, while preserving time for movement.
const planningFrameBudgetMs = 2;
export type MovingPlant = Position & {
    uid: number;
    id: string;
    growth: number;
    harvest?: unknown;
};
type Designation = Position & {
    flower: string;
};
export type MovementHost<T extends MovingPlant> = {
    plants: () => Iterable<T>;
    at: (p: Position) => T | undefined;
    walkable: (p: Position) => boolean;
    relocate: (moves: {
        plant: T;
        to: Position;
    }[]) => void;
    resetCycle: (plant: T) => void;
    discover: (chunk: Position) => void;
};
// Planning and relocation share a wall-clock budget per rendered frame.
// Simulation speed does not increase that movement-work budget.
export class PlantMovement<T extends MovingPlant> {
    readonly reservations = new PlantReservations();
    private controlled = new Map<number, T>();
    private plants = new Map<number, T>();
    private causes = new Map<string, number>();
    private planner: Generator<void> | undefined;
    private revision = 0;
    private discoveriesLeft = 0;
    private frameBudgetMs = frameWorkBudgetMs;
    private planningBudgetMs = planningSliceMs;
    private frameWorkUsedMs = 0;
    private discoveryBounds = new Map<string, number>();
    private cursor = 0;
    private unreachable = new Set<string>();
    constructor(private host: MovementHost<T>, private designations: Map<string, Designation>) { }
    isControlled(p: T) { return this.controlled.has(p.uid); }
    activePlants() { return this.controlled.values(); }
    status(p: T) { return this.reservations.byPlant.get(p.uid)?.status ?? (this.isControlled(p) ? 'Waiting to swap' : undefined); }
    changed() {
        this.revision++;
        this.planner = undefined;
        this.discovery.clear();
        this.discoveryBounds.clear();
        this.unreachable.clear();
        for (const job of this.reservations.byPlant.values()) {
            if ((job.kind === 'fill' && !this.matches(this.designations.get(positionKey(job.destination!)), job.species)) || (job.kind === 'evacuate' && this.acceptable(this.plants.get(job.plantUid)!, job.species)))
                this.finish(job);
            else {
                job.route = [];
                if (job.kind === 'evacuate' && job.destination && !this.acceptable(job.destination, job.species))
                    this.reservations.unclaim(job);
            }
        }
        this.releaseUnused();
    }
    plantAvailabilityChanged() {
        this.revision++;
        this.planner = undefined;
    }
    private take(p: T) {
        this.plants.set(p.uid, p);
        if (!this.controlled.has(p.uid))
            this.controlled.set(p.uid, p);
    }
    private finish(job: Reservation) { this.reservations.remove(job); }
    private releaseUnused() {
        const needed = new Set(this.reservations.byPlant.keys());
        for (const job of this.reservations.byPlant.values()) {
            const next = job.route[0], blocker = next && this.host.at(next);
            if (blocker && !blocker.harvest)
                needed.add(blocker.uid);
        }
        for (const [uid, p] of this.controlled)
            if (!needed.has(uid)) {
                this.controlled.delete(uid);
                this.plants.delete(uid);
                this.host.resetCycle(p);
            }
    }
    private create(p: T, kind: Reservation['kind'], destination?: Position, precedence?: number) {
        if (p.harvest)
            return;
        // Keep movement control (and cycle progress) when replacing evacuation.
        const previous = this.reservations.byPlant.get(p.uid);
        if (kind === 'fill' && previous?.kind === 'evacuate' && destination && !this.reservations.byDestination.has(positionKey(destination)))
            this.finish(previous);
        const job = this.reservations.create(p.uid, p.id, kind, destination, precedence);
        if (job)
            this.take(p);
        return job;
    }
    private acceptable(p: Position, species: string) {
        const designation = this.designations.get(positionKey(p));
        return !designation || (designation.flower !== 'avoid' && (designation.flower === 'any' || designation.flower === species));
    }
    private matches(designation: Designation | undefined, species: string) {
        return !!designation && designation.flower !== 'avoid' && (designation.flower === 'any' || designation.flower === species);
    }
    private *plan(job: Reservation): Generator<void> {
        const p = this.plants.get(job.plantUid);
        if (!p || job.route.length || this.reservations.byPlant.get(job.plantUid) !== job)
            return;
        if (!job.destination) {
            job.status = 'Finding free soil';
            const destination = yield* vacancySearch(p, this.host.walkable, q => !this.host.at(q) && this.acceptable(q, p.id) && !this.reservations.byDestination.has(positionKey(q)));
            if (destination && this.reservations.byPlant.get(job.plantUid) === job)
                this.reservations.claim(job, destination);
        }
        if (job.destination) {
            job.status = 'Planning route';
            job.route = (yield* routeSearch(p, job.destination, this.host.walkable)) ?? [];
            job.status = job.route.length ? 'Growing to move' : 'No terrain route';
            if (!job.route.length && job.kind === 'fill' && positionKey(p) !== positionKey(job.destination)) {
                this.unreachable.add(`${p.uid}:${positionKey(job.destination)}`);
                this.finish(job);
            }
        }
    }
    private *maintain(): Generator<void> {
        const revision = this.revision;
        while (revision === this.revision) {
            for (const job of this.reservations.byPlant.values()) {
                const p = this.plants.get(job.plantUid);
                if (!p) {
                    this.finish(job);
                    continue;
                }
                if (job.destination && positionKey(p) === positionKey(job.destination)) {
                    this.finish(job);
                    continue;
                }
                const occupant = job.destination && this.host.at(job.destination);
                if (job.kind === 'fill' && occupant?.id === job.species && !this.reservations.byPlant.has(occupant.uid)) {
                    this.finish(job);
                    continue;
                }
                if (job.destination && !this.host.walkable(job.destination)) {
                    this.finish(job);
                    continue;
                }
                if (job.kind === 'evacuate' && !job.destination && this.acceptable(p, p.id)) {
                    this.finish(job);
                    continue;
                }
                yield;
            }
            // Every mismatched occupant gets a stable request, even when the target
            // has not found its incoming filler yet.
            for (const target of this.designations.values()) {
                const p = this.host.at(target);
                if (p && !this.matches(target, p.id) && !this.reservations.byPlant.has(p.uid))
                    this.create(p, 'evacuate', undefined, this.causes.get(positionKey(target)));
                yield;
            }
            // Route existing work before looking for more recruits, so discovery
            // cannot postpone flowers that already have a destination.
            for (const job of [...this.reservations.byPlant.values()].sort((a, b) => precedes(a, b) ? -1 : 1)) {
                yield* this.plan(job);
                yield;
            }
            // Snapshot once: a live Map iterator can revisit plants indefinitely
            // when swaps remove and reinsert entries between planning yields.
            const candidates = new Map<string, T[]>();
            for (const plant of Array.from(this.host.plants())) {
                const group = candidates.get(plant.id) ?? [];
                group.push(plant);
                candidates.set(plant.id, group);
                yield;
            }
            const searched = new Set<string>();
            let anyCandidates: T[] | undefined;
            // Targets choose by distance with UID as a deterministic tie breaker.
            // Expand only until no undiscovered flower could be closer.
            for (const target of this.designations.values()) {
                const key = positionKey(target), occupant = this.host.at(target);
                if ((occupant && this.matches(target, occupant.id) && !this.reservations.byPlant.has(occupant.uid)) || target.flower === 'avoid' || this.reservations.byDestination.has(key))
                    continue;
                let best: T | undefined, bestDistance = Infinity;
                const targetCandidates = target.flower === 'any'
                    ? (anyCandidates ??= Array.from(candidates.values()).flat())
                    : candidates.get(target.flower) ?? [];
                for (const p of targetCandidates) {
                    yield;
                    if ((target.flower !== 'any' && p.id !== target.flower) || p.harvest || this.reservations.byPlant.get(p.uid)?.kind === 'fill' || this.unreachable.has(`${p.uid}:${key}`))
                        continue;
                    const own = this.designations.get(positionKey(p));
                    if (this.matches(own, p.id))
                        continue;
                    const distance = orthogonalDistance(p, target);
                    if (distance < bestDistance || (distance === bestDistance && p.uid < (best?.uid ?? Infinity))) {
                        best = p;
                        bestDistance = distance;
                    }
                }
                const discoveryKey = target.flower === 'any' ? 'any' : target.flower;
                if (best && (this.discoveryBounds.get(discoveryKey) ?? 0) > bestDistance) {
                    const job = this.create(best, 'fill', target, this.causes.get(key));
                    if (job) {
                        this.causes.delete(key);
                        yield* this.plan(job);
                    }
                }
                else if (!searched.has(discoveryKey)) {
                    searched.add(discoveryKey);
                    // Resume discovery rather than generating a whole search radius in
                    // one frame. Reconsider all targets after each generated chunk.
                    const cells = Array.from(this.designations.values()).filter(t => t.flower === discoveryKey);
                    const ring = this.discovery.get(discoveryKey) ?? discoveryRings(cells);
                    this.discovery.set(discoveryKey, ring);
                    // Advance the shared frontier in small batches instead of
                    // rescanning every candidate after every individual chunk.
                    // Actual chunk requests still share the two-per-frame cap.
                    for (let batch = 0; batch < 16; batch++) {
                        while (!this.discoveriesLeft)
                            yield;
                        const chunk = ring.next().value;
                        if ('distanceBound' in chunk) {
                            this.discoveryBounds.set(discoveryKey, chunk.distanceBound);
                            if (chunk.distanceBound > bestDistance)
                                break;
                        }
                        else {
                            this.host.discover(chunk);
                            this.discoveriesLeft--;
                        }
                        yield;
                    }
                }
            }
            this.releaseUnused();
            yield;
        }
    }
    private discovery = new Map<string, ReturnType<typeof discoveryRings>>();
    beginFrame(simulationTicks = 1, budgetMs = frameWorkBudgetMs) {
        const normalizedBudgetMs = Math.max(0, budgetMs);
        this.frameBudgetMs = normalizedBudgetMs;
        this.frameWorkUsedMs = 0;
        // Keep one planning slice available while paused so designations still resolve.
        this.planningBudgetMs = Math.min(planningFrameBudgetMs, Math.max(1, simulationTicks) * planningSliceMs, normalizedBudgetMs);
        this.discoveriesLeft = 2;
        if (!this.designations.size && !this.reservations.byPlant.size && !this.controlled.size) {
            this.planner = undefined;
            return;
        }
    }
    planTick() {
        if (!this.designations.size && !this.reservations.byPlant.size && !this.controlled.size)
            return;
        const sliceMs = Math.min(planningSliceMs, this.planningBudgetMs - this.frameWorkUsedMs);
        if (sliceMs <= 0)
            return;
        this.planner ??= this.maintain();
        const planningStartedAt = performance.now();
        const planningDeadline = planningStartedAt + sliceMs;
        while (performance.now() < planningDeadline)
            if (this.planner.next().done) {
                this.planner = this.maintain();
            }
        this.frameWorkUsedMs += performance.now() - planningStartedAt;
    }
    step() {
        if (!this.reservations.byPlant.size)
            return;
        if (this.frameWorkUsedMs >= this.frameBudgetMs)
            return;
        const stepStartedAt = performance.now();
        const withinBudget = () => this.frameWorkUsedMs + performance.now() - stepStartedAt < this.frameBudgetMs;
        const jobs = [...this.reservations.byPlant.values()];
        let relocated = false;
        for (let i = 0; i < jobs.length && withinBudget(); i++) {
            const job = jobs[this.cursor++ % jobs.length];
            if (this.reservations.byPlant.get(job.plantUid) !== job)
                continue;
            const p = this.plants.get(job.plantUid), to = job.route[0];
            if (!p || !to || p.harvest)
                continue;
            if (orthogonalDistance(p, to) !== 1 || !this.host.walkable(to)) {
                job.route = [];
                continue;
            }
            const blocker = this.host.at(to), other = blocker && this.reservations.byPlant.get(blocker.uid);
            if (blocker?.harvest) {
                job.status = 'Waiting for harvest collection';
                continue;
            }
            if (blocker && !swapAllowed(job, other, p, blocker)) {
                job.status = 'Waiting for earlier reservation';
                continue;
            }
            if (blocker)
                this.take(blocker);
            if (p.growth < 1 || (blocker && blocker.growth < 1)) {
                job.status = 'Growing to move';
                continue;
            }
            const from = { x: p.x, y: p.y };
            const moves = [{ plant: p, to }];
            if (blocker)
                moves.push({ plant: blocker, to: from });
            for (const move of moves) {
                const d = this.designations.get(positionKey(move.plant));
                if (d?.flower === move.plant.id)
                    this.causes.set(positionKey(d), job.precedence);
            }
            this.host.relocate(moves);
            for (const move of moves)
                this.host.resetCycle(move.plant);
            job.route.shift();
            if (other) {
                if (other.route[0] && positionKey(other.route[0]) === positionKey(from))
                    other.route.shift();
                else
                    other.route = [];
            }
            if (blocker && !other && !this.acceptable(blocker, blocker.id))
                this.create(blocker, 'evacuate', undefined, job.precedence);
            if (job.destination && positionKey(p) === positionKey(job.destination))
                this.finish(job);
            if (other?.destination && blocker && positionKey(blocker) === positionKey(other.destination))
                this.finish(other);
            relocated = true;
        }
        if (relocated)
            this.releaseUnused();
        this.frameWorkUsedMs += performance.now() - stepStartedAt;
    }
}
