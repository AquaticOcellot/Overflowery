export const generatorPowerWatts = 1_000;
export const generatorCapacityJoules = 10_000;
export const batteryCapacityJoules = 100_000;

export type FuelCharge = { totalJoules: number; remainingJoules: number };

export function fuelEnergyJoules(qualityTier: number) {
  return 2_000 * 2 ** qualityTier;
}

export function formatEnergy(joules: number) {
  return joules >= 1_000 ? `${(joules / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} kJ`
    : `${Math.floor(joules)} J`;
}

// A generator converts local heat into its own buffer; connected power networks share buffers by priority.
export function advanceGenerator(availableHeat: number, storedJoules: number, seconds: number) {
  const generated = Math.max(0, Math.min(availableHeat, generatorPowerWatts * Math.max(0, seconds), generatorCapacityJoules - storedJoules));
  return { heatUsed: generated, storedJoules: storedJoules + generated };
}
