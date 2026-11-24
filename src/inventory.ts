export const inventorySlots = 32;
export const stackLimit = 100;
export const machineInputSlots = 4;
export type SlotStack = { flower: string; quality: { id: string }; count: number };
export type Inventory<T extends SlotStack> = (T | null)[];
const qualityOrder = ['normal', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exalted', 'divine', 'cosmic', 'transcendent'];
export function qualityRank(id: string) { return qualityOrder.indexOf(id); }

export function hasQualityFlowers<T extends SlotStack>(slots: Inventory<T>, qualityId: string, amount: number) {
  return slots.reduce((total, stack) => total + (stack?.quality.id === qualityId ? stack.count : 0), 0) >= amount;
}

export function payQualityFlowers<T extends SlotStack>(slots: Inventory<T>, qualityId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 0 || !hasQualityFlowers(slots, qualityId, amount)) return false;
  let remaining = amount;
  for (let index = 0; index < slots.length && remaining; index++) {
    const stack = slots[index];
    if (!stack || stack.quality.id !== qualityId) continue;
    const used = Math.min(remaining, stack.count);
    stack.count -= used;
    remaining -= used;
    if (!stack.count) slots[index] = null;
  }
  return true;
}

export function storeFlower<F extends string, Q extends { id: string }>(
  inventory: ({ flower: F; quality: Q; count: number } | null)[], flower: F, quality: Q, maxSlots = inventorySlots,
) {
  const stack = inventory.find((item) => item?.flower === flower && item.quality.id === quality.id && item.count < stackLimit);
  if (stack) stack.count++;
  else {
    const empty = inventory.indexOf(null);
    if (empty >= 0) inventory[empty] = { flower, quality, count: 1 };
    else {
      if (inventory.length >= maxSlots) return false;
      inventory.push({ flower, quality, count: 1 });
    }
  }
  return true;
}

export function moveStack<T extends SlotStack>(source: Inventory<T>, from: number, destination: Inventory<T>, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= source.length || to < 0 || to >= destination.length || (source === destination && from === to)) return false;
  const stack = source[from], target = destination[to];
  if (!stack) return false;
  if (target && target.flower === stack.flower && target.quality.id === stack.quality.id) {
    const amount = Math.min(stack.count, stackLimit - target.count);
    if (amount <= 0) return false;
    target.count += amount;
    stack.count -= amount;
    if (!stack.count) source[from] = null;
  } else {
    destination[to] = stack;
    source[from] = target;
  }
  return true;
}

export function takeInput<T extends SlotStack>(slots: Inventory<T>) {
  const index = slots.findIndex((stack) => stack && stack.count > 0);
  if (index < 0) return undefined;
  const stack = slots[index]!;
  const item = { ...stack, count: 1 };
  if (--stack.count === 0) slots[index] = null;
  return item;
}
