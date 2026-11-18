export const generatorPowerWatts = 1_000;
export const bufferCapacityJoules = 100_000;

export type FuelCharge = { totalJoules: number; remainingJoules: number };

export function fuelEnergyJoules(qualityTier: number) {
  return 2_000 * 2 ** qualityTier;
}

export function formatEnergy(joules: number) {
  return joules >= 1_000 ? `${(joules / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} kJ`
    : `${Math.floor(joules)} J`;
}

// Share the remaining buffer space proportionally when multiple generators fill it.
export function advanceGeneration(charges: FuelCharge[], storedJoules: number, seconds: number) {
  const available = Math.max(0, bufferCapacityJoules - storedJoules);
  const demands = charges.map((charge) => Math.min(charge.remainingJoules, generatorPowerWatts * Math.max(0, seconds)));
  const demand = demands.reduce((sum, value) => sum + value, 0);
  const ratio = demand > 0 ? Math.min(1, available / demand) : 0;
  let generated = 0;
  charges.forEach((charge, index) => {
    const transferred = demands[index] * ratio;
    charge.remainingJoules -= transferred;
    generated += transferred;
  });
  return Math.min(bufferCapacityJoules, storedJoules + generated);
}
