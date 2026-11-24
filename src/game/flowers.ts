import { environmentGrowth, environmentQuality } from '../world';
import { overgrowthState, rollQualityTier } from '../harvest';
import type { Flower, Quality } from './types';

type FlowerGrowthOptions = { seed: number; growSeconds: number; controlled: boolean };
type HarvestOptions = { qualities: Quality[]; researchLevels: ReadonlyMap<string, number>; seed: number };

export function prepareHarvest(flower: Flower, options: HarvestOptions) {
  const { qualities, researchLevels, seed } = options;
  const baseChance = 10 + (researchLevels.get('selective-breeding') ?? 0) + flower.fertilizer * 4;
  const bonus = environmentQuality(flower.id, flower.elevation, flower.watering, seed);
  flower.harvest = {
    qualities: Array.from({ length: overgrowthState(flower.growth).rolls }, () => qualities[rollQualityTier(baseChance / 100, bonus)]),
    regrowthSeconds: flower.cycleStartedAt !== undefined && flower.readyAt !== undefined ? flower.readyAt - flower.cycleStartedAt : undefined,
    modified: flower.cycleBoosted || flower.fertilizer > 0 || (researchLevels.get('selective-breeding') ?? 0) > 0,
    loggedGrowth: false,
  };
}

export function passiveGrowth(flower: Flower, seconds: number, start: number, options: FlowerGrowthOptions) {
  if (flower.harvest) return;
  const rate = environmentGrowth(flower.id, flower.elevation, flower.watering, options.seed) / flower.growthDuration / options.growSeconds;
  if (flower.growth < 1 && flower.growth + seconds * rate >= 1) flower.readyAt = start + (1 - flower.growth) / rate;
  flower.growth = Math.min(options.controlled ? 1 : Infinity, flower.growth + seconds * rate);
}
