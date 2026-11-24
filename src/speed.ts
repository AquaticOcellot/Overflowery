export class SimulationSpeed {
  multiplier = 1;
  increase() { this.multiplier = Math.min(100, this.multiplier * 10); }
  decrease() { this.multiplier = Math.max(0.1, this.multiplier / 10); }
}

export function simulationSteps(realSeconds: number, multiplier: number) {
  const total = Math.max(0, realSeconds) * multiplier;
  const count = Math.ceil(total / .05);
  return { count, seconds: count ? total / count : 0 };
}
