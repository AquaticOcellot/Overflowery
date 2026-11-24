import { positionKey, type Position } from './plant-routing';
export type Reservation = {
    ticket: number;
    precedence: number;
    plantUid: number;
    species: string;
    kind: 'fill' | 'evacuate';
    destination?: Position;
    route: Position[];
    status: string;
};
// Identity, ownership, and ordering live here; there is no waiting/return stack.
export class PlantReservations {
    readonly byPlant = new Map<number, Reservation>();
    readonly byDestination = new Map<string, Reservation>();
    private nextTicket = 1;
    create(plantUid: number, species: string, kind: Reservation['kind'], destination?: Position, precedence?: number) {
        if (this.byPlant.has(plantUid) || (destination && this.byDestination.has(positionKey(destination))))
            return;
        const ticket = this.nextTicket++;
        const job: Reservation = { ticket, precedence: precedence ?? ticket, plantUid, species, kind, destination, route: [], status: 'Choosing destination' };
        this.byPlant.set(plantUid, job);
        if (destination)
            this.byDestination.set(positionKey(destination), job);
        return job;
    }
    claim(job: Reservation, p: Position) {
        const key = positionKey(p), existing = this.byDestination.get(key);
        if (existing && existing !== job)
            return false;
        if (job.destination)
            this.byDestination.delete(positionKey(job.destination));
        job.destination = { ...p };
        this.byDestination.set(key, job);
        return true;
    }
    unclaim(job: Reservation) {
        if (job.destination && this.byDestination.get(positionKey(job.destination)) === job)
            this.byDestination.delete(positionKey(job.destination));
        job.destination = undefined;
        job.route = [];
    }
    remove(job: Reservation) {
        if (this.byPlant.get(job.plantUid) !== job)
            return;
        this.byPlant.delete(job.plantUid);
        if (job.destination && this.byDestination.get(positionKey(job.destination)) === job)
            this.byDestination.delete(positionKey(job.destination));
    }
}
export const precedes = (a: Reservation, b: Reservation) => a.precedence < b.precedence || (a.precedence === b.precedence && a.ticket < b.ticket);
export function swapAllowed(a: Reservation, b: Reservation | undefined, aPosition: Position, bPosition: Position) {
    if (!b || precedes(a, b))
        return true;
    // Both advance along their planned route, even if the initiator is younger.
    return !!(a.route[0] && b.route[0] && positionKey(a.route[0]) === positionKey(bPosition) && positionKey(b.route[0]) === positionKey(aPosition));
}
