import { queuedMaterials } from '../construction';
import { burnerSettings } from '../buildings';
import { batteryCapacityJoules, formatEnergy, generatorCapacityJoules } from '../energy';
import { harvesterEnergyPerRoll } from '../game/harvester';
import { storedPower, type RootNetwork } from '../roots';
import type { Machine } from '../game/types';

type MachineStatusOptions = {
  machines: Map<string, Machine>;
  selectedMachine: () => string;
  powerNetwork: RootNetwork;
  heatNetwork: RootNetwork;
  nutrientNetwork: RootNetwork;
  setEnergy: (energy: number) => void;
  ash: () => number;
  energyCount: HTMLElement;
  ashCount: HTMLElement;
  researchEnergy: HTMLElement;
  cycleLabel: HTMLElement;
  cycleTime: HTMLElement;
  cycleProgress: HTMLElement;
  machineTitle: HTMLElement;
  generatorStorage: HTMLElement;
  bufferCharge: HTMLElement;
  energyBuffer: HTMLMeterElement;
  storageLabel: HTMLElement;
  cancelConstruction: HTMLButtonElement;
};

export function createMachineStatus(options: MachineStatusOptions) {
  const { machines, selectedMachine, powerNetwork, heatNetwork, nutrientNetwork, setEnergy, ash,
    energyCount, ashCount, researchEnergy, cycleLabel, cycleTime, cycleProgress, machineTitle,
    generatorStorage, bufferCharge, energyBuffer, storageLabel, cancelConstruction } = options;

  function updateResources() {
    const totalEnergy = storedPower(powerNetwork);
    setEnergy(totalEnergy);
    energyCount.textContent = formatEnergy(totalEnergy);
    ashCount.textContent = String(ash());
    researchEnergy.textContent = formatEnergy(totalEnergy);
  }

  function updateGeneratorCycle() {
    const machine = machines.get(selectedMachine());
    machineTitle.textContent = machine?.kind === 'composter' ? 'Composter' : machine?.kind === 'generator' ? 'Heat generator' : machine?.kind === 'battery' ? 'Battery' : machine?.kind === 'harvester' ? 'Harvester' : machine?.kind === 'small-burner' ? 'Small burner' : 'Large burner';
    generatorStorage.hidden = !!machine?.construction || (machine?.kind !== 'generator' && machine?.kind !== 'battery');
    cancelConstruction.hidden = !machine?.construction;
    storageLabel.textContent = machine?.kind === 'battery' ? 'Battery storage' : 'Generator storage';
    if (machine?.kind === 'generator') {
      const stored = powerNetwork.amount(machine);
      bufferCharge.textContent = `${formatEnergy(stored)} / ${formatEnergy(generatorCapacityJoules)}`;
      energyBuffer.max = generatorCapacityJoules;
      energyBuffer.value = stored;
    }
    const power = burnerSettings(machine?.kind ?? 'burner');
    const powerLabel = `${power.fuelWatts / 1000} kW fuel → ${power.fuelWatts * power.heatMultiplier / 1000} kW heat`;
    if (machine?.construction) {
      const state = machine.construction;
      machineTitle.textContent = `${machine.kind === 'small-burner' ? 'Small burner' : machine.kind === 'burner' ? 'Large burner' : machine.kind === 'generator' ? 'Generator' : machine.kind === 'battery' ? 'Battery' : machine.kind === 'harvester' ? 'Harvester' : 'Composter'} construction`;
      cycleLabel.textContent = state.materialCost > 0 && state.secondsBuilt >= state.paidFlowers ? 'Waiting for Uncommon or better flowers' : 'Constructing';
      const progress = Math.min(1, state.secondsBuilt / state.durationSeconds);
      cycleTime.textContent = state.materialCost > 0
        ? `${Math.floor(progress * 100)}% · ${state.paidFlowers + queuedMaterials(machine.materials)}/${state.materialCost} Uncommon+ delivered · ${state.secondsBuilt.toFixed(1)}/${state.durationSeconds}s built`
        : `${Math.floor(progress * 100)}% · ${state.secondsBuilt.toFixed(1)}/${state.durationSeconds}s built`;
      cycleProgress.style.width = `${progress * 100}%`;
      return;
    }
    if (machine?.kind === 'battery') {
      const stored = powerNetwork.amount(machine);
      bufferCharge.textContent = `${formatEnergy(stored)} / ${formatEnergy(batteryCapacityJoules)}`;
      energyBuffer.max = batteryCapacityJoules;
      energyBuffer.value = stored;
      cycleLabel.textContent = 'Connected power storage';
      cycleTime.textContent = 'Stores energy carried by connected utility roots.';
      cycleProgress.style.width = `${stored / batteryCapacityJoules * 100}%`;
      return;
    }
    if (machine?.kind === 'generator') {
      cycleLabel.textContent = powerNetwork.amount(machine) >= generatorCapacityJoules ? 'Paused · generator storage full' : 'Converting available heat';
      cycleTime.textContent = `${formatEnergy(heatNetwork.amount(machine))} heat available · up to 1 kW electricity`;
      cycleProgress.style.width = '0%';
      return;
    }
    if (machine?.kind === 'harvester') {
      const stored = powerNetwork.amount(machine);
      const capacity = powerNetwork.capacity(machine);
      cycleLabel.textContent = stored >= harvesterEnergyPerRoll ? 'Powered · harvesting ripe flowers' : 'Waiting for power';
      cycleTime.textContent = `${formatEnergy(stored)} / ${formatEnergy(capacity)} · 1 kJ per harvest roll · 2-tile range`;
      cycleProgress.style.width = `${Math.min(1, stored / harvesterEnergyPerRoll) * 100}%`;
      return;
    }
    if (machine?.compost) {
      const paused = nutrientNetwork.amount(machine) >= nutrientNetwork.capacity(machine);
      cycleLabel.textContent = paused ? 'Paused · nutrient storage full' : 'Composting';
      cycleTime.textContent = `${machine.compost.remaining.toFixed(1)} nutrients left · 2 nutrients/s`;
      cycleProgress.style.width = `${(1 - machine.compost.remaining / 8) * 100}%`;
      return;
    }
    const job = machine?.job;
    if (!job) {
      cycleLabel.textContent = 'Idle · input buffer empty';
      cycleTime.textContent = machine?.kind === 'composter' ? '2 nutrients/s' : `${powerLabel} · ${power.heatMultiplier * 100}% efficiency`;
      cycleProgress.style.width = '0%';
      return;
    }
    const paused = !!machine && heatNetwork.amount(machine) >= heatNetwork.capacity(machine);
    cycleLabel.textContent = `${paused ? 'Paused · heat storage full ·' : 'Burning'} ${job.qualityName} ${job.flowerName}`;
    cycleTime.textContent = `${paused ? '0 kW (paused)' : powerLabel} · ${formatEnergy(job.remainingJoules)} fuel · ${(job.remainingJoules / power.fuelWatts).toFixed(1)}s left · +1 ash on completion`;
    cycleProgress.style.width = `${(1 - job.remainingJoules / job.totalJoules) * 100}%`;
  }

  return { updateResources, updateGeneratorCycle };
}
