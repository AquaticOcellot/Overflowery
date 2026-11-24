// Completing stage n requires n^3 additional base growth cycles.
export function overgrowthState(growth: number) {
  const work = Math.max(0, growth);
  let stage = Math.max(0, Math.floor((Math.sqrt(1 + 8 * Math.sqrt(work)) - 1) / 2));
  const threshold = (n: number) => (n * (n + 1) / 2) ** 2;
  while (stage > 0 && threshold(stage) > work) stage--;
  while (threshold(stage + 1) <= work) stage++;
  return { stage, rolls: stage ** 2, progress: (work - threshold(stage)) / (stage + 1) ** 3 };
}

// Initial flowers already have simulated growth progress. Include that elapsed age
// so their first harvest measures a full cycle rather than only the remaining time.
export function initialGrowthTiming(growth: number, now: number, durationSeconds: number) {
  return { cycleStartedAt: now - growth * durationSeconds, readyAt: growth >= 1 ? now : undefined };
}

export const randomGrowthDuration = (random = Math.random) => 0.85 + random() * 0.3;

export function qualityProbabilities(chance: number, tiers = 10) {
  const p = Math.max(0, Math.min(0.75, chance));
  return Array.from({ length: tiers }, (_, index) => index === tiers - 1 ? p ** index : (1 - p) * p ** index);
}

export function rollQualityTier(baseChance: number, environmentBonus: number, random = Math.random) {
  const chances = qualityProbabilities(baseChance * environmentBonus * (0.9 + random() * 0.2));
  let roll = random();
  for (let index = 0; index < chances.length; index++) {
    roll -= chances[index];
    if (roll < 0) return index;
  }
  return chances.length - 1;
}

export type HarvestSample = {
  flower: string; elevation: number; watering: number; qualityTier: number;
  regrowthSeconds?: number; modified: boolean;
};
export type HarvestStats = { count: number; qualities: number[]; growthCount: number; growthSeconds: number };
const emptyStats = (): HarvestStats => ({ count: 0, qualities: Array(10).fill(0), growthCount: 0, growthSeconds: 0 });

export class HarvestJournal {
  private bins = new Map<string, { all: HarvestStats; natural: HarvestStats }>();
  private key(flower: string, elevation: number, watering: number) {
    return `${flower}:${Math.max(0, Math.min(9, Math.floor(elevation * 10)))}:${Math.max(0, Math.min(9, Math.floor(watering * 10)))}`;
  }

  record(sample: HarvestSample) {
    const key = this.key(sample.flower, sample.elevation, sample.watering);
    let bin = this.bins.get(key);
    if (!bin) { bin = { all: emptyStats(), natural: emptyStats() }; this.bins.set(key, bin); }
    for (const stats of sample.modified ? [bin.all] : [bin.all, bin.natural]) {
      stats.count++;
      stats.qualities[sample.qualityTier]++;
      if (sample.regrowthSeconds !== undefined && sample.regrowthSeconds > 0) {
        stats.growthCount++;
        stats.growthSeconds += sample.regrowthSeconds;
      }
    }
  }

  get(flower: string, elevationBin: number, wateringBin: number, natural = false) {
    const bin = this.bins.get(`${flower}:${elevationBin}:${wateringBin}`);
    return bin ? natural ? bin.natural : bin.all : undefined;
  }
}

export function harvestMeasurement(stats: HarvestStats | undefined, metric: 'quality' | 'growth') {
  const count = metric === 'growth' ? stats?.growthCount ?? 0 : stats?.count ?? 0;
  const unit = metric === 'growth' ? count === 1 ? 'cycle' : 'cycles' : count === 1 ? 'roll' : 'rolls';
  const value = !count || !stats ? undefined : metric === 'growth'
    ? stats.growthSeconds / count
    : (stats.count - stats.qualities[0]) / count;
  return { count, unit, value };
}
