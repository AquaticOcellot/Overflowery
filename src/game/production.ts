import { fuelEnergyJoules } from '../energy';
import { takeInput } from '../inventory';
import type { Machine, Quality } from './types';

type FlowerKind = { id: string; name: string };

export function startBufferedJob(machine: Machine, kinds: FlowerKind[], qualities: Quality[]) {
  if (machine.construction || machine.kind === 'generator' || machine.kind === 'battery' || machine.kind === 'harvester' || machine.job || machine.compost) return false;
  const stack = takeInput(machine.input);
  if (!stack) return false;
  if (machine.kind === 'composter') machine.compost = { remaining: 8 };
  else {
    const totalJoules = fuelEnergyJoules(qualities.indexOf(stack.quality));
    machine.job = {
      flowerName: kinds.find((flower) => flower.id === stack.flower)!.name,
      qualityName: stack.quality.name,
      totalJoules,
      remainingJoules: totalJoules,
    };
  }
  return true;
}
