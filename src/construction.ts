import { qualityRank } from './inventory';

type Stack = { flower: string; quality: { id: string }; count: number };
export const burnerConstructionCost = 10;
export const defaultConstructionTime = 1;
export type Construction = { paidFlowers: number; secondsBuilt: number; durationSeconds: number; materialCost: number; spentMaterials: { qualityId: string; count: number }[] };
export const createConstruction = (durationSeconds = defaultConstructionTime, materialCost = 0): Construction => ({ paidFlowers: 0, secondsBuilt: 0, durationSeconds, materialCost, spentMaterials: [] });

export function queuedMaterials(slots: (Stack | null)[]) {
  return slots.reduce((sum, stack) => sum + (stack && qualityRank(stack.quality.id) >= qualityRank('uncommon') ? stack.count : 0), 0);
}

export function deliverMaterials<T extends Stack>(source: (T | null)[], from: number, target: (T | null)[], to: number, state: Construction) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= source.length || to >= target.length || source === target) return false;
  const stack = source[from], destination = target[to];
  const incomingRank = stack ? qualityRank(stack.quality.id) : -1;
  if (!stack || state.materialCost <= 0 || incomingRank < qualityRank('uncommon') || (destination && (destination.flower !== stack.flower || destination.quality.id !== stack.quality.id))) return false;
  const amount = Math.max(0, Math.min(stack.count, 100 - (destination?.count ?? 0), state.materialCost - state.paidFlowers - queuedMaterials(target)));
  if (!amount) return false;
  if (destination) destination.count += amount;
  else target[to] = { ...stack, count: amount };
  stack.count -= amount;
  if (!stack.count) source[from] = null;
  return true;
}

// Each flower funds one second. Consume it only when its second of work starts.
export function advanceConstruction(state: Construction, slots: (Stack | null)[], seconds: number) {
  let time = Math.max(0, seconds);
  if (state.materialCost === 0) {
    state.secondsBuilt = Math.min(state.durationSeconds, state.secondsBuilt + time);
    return state.secondsBuilt >= state.durationSeconds;
  }
  while (time > 1e-9 && state.secondsBuilt < state.durationSeconds) {
    if (state.secondsBuilt >= state.paidFlowers) {
      const index = slots.findIndex((stack) => stack && qualityRank(stack.quality.id) >= qualityRank('uncommon') && stack.count > 0);
      if (index < 0 || state.paidFlowers >= state.materialCost) break;
      const consumed = slots[index]!;
      const spent = state.spentMaterials.find((material) => material.qualityId === consumed.quality.id);
      if (spent) spent.count++;
      else state.spentMaterials.push({ qualityId: consumed.quality.id, count: 1 });
      if (--slots[index]!.count === 0) slots[index] = null;
      state.paidFlowers++;
    }
    const work = Math.min(time, state.paidFlowers - state.secondsBuilt, state.durationSeconds - state.secondsBuilt);
    state.secondsBuilt += work;
    time -= work;
  }
  return state.secondsBuilt >= state.durationSeconds;
}
