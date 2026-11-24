import { itemLevelIcons, qualityIcons, qualityOrder } from '../assets';
import { deliverMaterials } from '../construction';
import { inventorySlots, stackLimit, moveStack, type Inventory } from '../inventory';
import type { Machine, Stack } from '../game/types';

type FlowerKind = { id: string; name: string };
type InventoryViewOptions = {
  inventory: Inventory<Stack>;
  machines: Map<string, Machine>;
  kinds: FlowerKind[];
  selectedMachine: () => string;
  inventoryView: HTMLElement;
  toggleStackCount: HTMLElement;
  fuelList: HTMLElement;
  fuelCount: HTMLElement;
  updateGeneratorCycle: () => void;
  notify: (message: string) => void;
};

export function createInventoryView(options: InventoryViewOptions) {
  const { inventory, machines, kinds, selectedMachine, inventoryView, toggleStackCount, fuelList, fuelCount, updateGeneratorCycle, notify } = options;

  function slotMarkup(slots: Inventory<Stack>, owner: string) {
    return slots.map((stack, index) => {
      const attributes = `data-owner="${owner}" data-slot="${index}" role="listitem"`;
      if (!stack) return `<div class="inventory-slot empty-slot" ${attributes} aria-label="Slot ${index + 1}: empty"></div>`;
      const flower = kinds.find((item) => item.id === stack.flower)!;
      const description = `${stack.quality.name} ${flower.name} · ${stack.count}/${stackLimit}`;
      const qualityLevel = Math.max(0, qualityOrder.indexOf(stack.quality.id));
      const flowerIcon = itemLevelIcons[stack.flower][Math.min(qualityLevel, itemLevelIcons[stack.flower].length - 1)];
      return `<div class="inventory-slot item-stack" ${attributes} aria-label="Slot ${index + 1}: ${description}">
        <span class="item-picture"><img class="flower-item" src="${flowerIcon}" alt="${flower.name}" draggable="false">
        <img class="quality-badge" src="${qualityIcons[stack.quality.id]}" alt="${stack.quality.name}" draggable="false"></span>
        <b class="item-count">${stack.count}</b>
      </div>`;
    }).join('');
  }

  function inventoryFor(owner: string) {
    if (owner === 'bag') return inventory;
    const machine = machines.get(owner.slice('machine:'.length));
    if (machine?.construction) return machine.construction.materialCost > 0 ? machine.materials : undefined;
    if (machine?.kind === 'harvester') return machine.output;
    return machine && machine.kind !== 'generator' && machine.kind !== 'battery' && machine.kind !== 'harvester' ? machine.input : undefined;
  }

  function renderInventory() {
    toggleStackCount.textContent = `${inventory.filter(Boolean).length}/${inventorySlots}`;
    inventoryView.innerHTML = slotMarkup(inventory, 'bag');
  }

  function renderFuel() {
    const machine = machines.get(selectedMachine());
    updateGeneratorCycle();
    const hasInput = !!machine && (machine.construction ? machine.construction.materialCost > 0 : machine.kind === 'harvester' || (machine.kind !== 'generator' && machine.kind !== 'battery'));
    document.querySelector<HTMLElement>('#machine-input')!.hidden = !hasInput;
    if (!hasInput || !machine) { fuelList.innerHTML = ''; return; }
    const slots = machine.construction ? machine.materials : machine.kind === 'harvester' ? machine.output! : machine.input;
    document.querySelector<HTMLElement>('#input-label')!.textContent = machine.construction ? 'Uncommon materials' : machine.kind === 'harvester' ? 'Output inventory' : 'Input buffer';
    fuelList.setAttribute('aria-label', machine.kind === 'harvester' && !machine.construction ? 'Harvester output inventory slots' : 'Machine input slots');
    fuelCount.textContent = machine.kind === 'harvester' && !machine.construction
      ? `${slots.filter(Boolean).length}/${slots.length} slots`
      : `${slots.reduce((sum, stack) => sum + (stack?.count ?? 0), 0)} flowers`;
    fuelList.innerHTML = slotMarkup(slots, `machine:${selectedMachine()}`);
  }

  function setupDrag() {
    let drag: { pointerId: number; source: Inventory<Stack>; owner: string; index: number; stack?: Stack; x: number; y: number; shift: boolean; ctrl: boolean; swept: boolean; sweptSlots: Set<number>; ghost?: HTMLElement } | null = null;
    const selectedMachineContainer = () => {
      const machine = machines.get(selectedMachine());
      if (!machine) return undefined;
      if (machine.construction) return machine.construction.materialCost > 0 ? machine.materials : undefined;
      if (machine.kind === 'harvester') return machine.output;
      return machine.kind !== 'generator' && machine.kind !== 'battery' ? machine.input : undefined;
    };
    const otherContainer = (source: Inventory<Stack>) => {
      const machineContainer = selectedMachineContainer();
      const machine = machines.get(selectedMachine());
      if (source === inventory && machine?.kind === 'harvester') return undefined;
      return source === inventory ? machineContainer : source === machineContainer ? inventory : undefined;
    };
    const isHarvesterOutput = (slots: Inventory<Stack>) => [...machines.values()].some(machine => machine.output === slots);
    function transferStack(source: Inventory<Stack>, index: number, destination: Inventory<Stack>) {
      const stack = source[index];
      if (!stack || source === destination) return false;
      const blueprint = [...machines.values()].find(machine => machine.construction && machine.materials === destination);
      const targets = destination.map((target, slot) => ({ target, slot }))
        .filter(({ target }) => !target || (target.flower === stack.flower && target.quality.id === stack.quality.id))
        .sort((a, b) => {
          return Number(!a.target) - Number(!b.target);
        });
      let moved = false;
      for (const { slot } of targets) {
        if (!source[index]) break;
        const didMove = blueprint?.construction
          ? deliverMaterials(source, index, destination, slot, blueprint.construction)
          : moveStack(source, index, destination, slot);
        moved = didMove || moved;
      }
      return moved;
    }
    function transferMatching(source: Inventory<Stack>, index: number, destination: Inventory<Stack>) {
      const stack = source[index];
      if (!stack) return false;
      const matching = source.flatMap((candidate, slot) => candidate && candidate.flower === stack.flower && candidate.quality.id === stack.quality.id ? [slot] : []);
      let moved = false;
      for (const slot of matching) moved = transferStack(source, slot, destination) || moved;
      return moved;
    }
    function transferAll(source: Inventory<Stack>, destination: Inventory<Stack>) {
      let moved = false;
      for (let index = 0; index < source.length; index++)
        if (source[index]) moved = transferStack(source, index, destination) || moved;
      return moved;
    }
    function refreshContainers() {
      renderInventory();
      renderFuel();
    }
    const clear = () => {
      drag?.ghost?.remove();
      if (drag && document.body.hasPointerCapture(drag.pointerId)) document.body.releasePointerCapture(drag.pointerId);
      document.querySelectorAll('.drop-target').forEach((slot) => slot.classList.remove('drop-target'));
      document.body.classList.remove('inventory-dragging');
      drag = null;
    };
    document.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-owner][data-slot]');
      if (!slot) return;
      const source = inventoryFor(slot.dataset.owner!);
      const index = Number(slot.dataset.slot);
      const stack = source?.[index];
      if (!source || (!stack && !event.ctrlKey)) return;
      event.preventDefault();
      drag = { pointerId: event.pointerId, source, owner: slot.dataset.owner!, index, stack, x: event.clientX, y: event.clientY,
        shift: event.shiftKey, ctrl: event.ctrlKey, swept: false, sweptSlots: new Set() };
      document.body.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.shift && !drag.ctrl && !drag.swept && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 5) {
        drag.swept = true;
        const destination = otherContainer(drag.source);
        if (destination) {
          const transferAt = (index: number) => {
            if (drag!.sweptSlots.has(index)) return;
            drag!.sweptSlots.add(index);
            if (transferStack(drag!.source, index, destination)) refreshContainers();
          };
          transferAt(drag.index);
          const firstSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-owner][data-slot]');
          if (firstSlot?.dataset.owner === drag.owner) transferAt(Number(firstSlot.dataset.slot));
        }
      }
      if (drag.shift && !drag.ctrl && drag.swept) {
        const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-owner][data-slot]');
        const destination = otherContainer(drag.source);
        const index = Number(slot?.dataset.slot);
        if (destination && slot?.dataset.owner === drag.owner && Number.isInteger(index) && !drag.sweptSlots.has(index)) {
          drag.sweptSlots.add(index);
          if (transferStack(drag.source, index, destination)) refreshContainers();
        }
        return;
      }
      if (!drag.stack || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      if (!drag.ghost) {
        const ghost = document.createElement('div');
        ghost.className = 'inventory-drag-ghost';
        ghost.innerHTML = slotMarkup([drag.stack], 'preview');
        document.body.appendChild(ghost);
        document.body.classList.add('inventory-dragging');
        drag.ghost = ghost;
      }
      drag.ghost.style.left = `${event.clientX + 10}px`;
      drag.ghost.style.top = `${event.clientY + 10}px`;
      document.querySelectorAll('.drop-target').forEach((slot) => slot.classList.remove('drop-target'));
      document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-owner][data-slot]')?.classList.add('drop-target');
    });
    document.addEventListener('pointerup', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.ghost && drag.source[drag.index] === drag.stack) {
        const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-owner][data-slot]');
        const destination = slot ? inventoryFor(slot.dataset.owner!) : undefined;
        if (slot && destination) {
          const index = Number(slot.dataset.slot);
          const blueprint = [...machines.values()].find((machine) => machine.construction && machine.materials === destination);
          const fromBlueprint = [...machines.values()].some((machine) => machine.construction && machine.materials === drag!.source);
          if (isHarvesterOutput(destination) && destination !== drag.source) {
            notify('Harvester output inventory only accepts harvested flowers');
          } else if (isHarvesterOutput(drag.source) && destination !== drag.source && destination[index]
            && (destination[index]!.flower !== drag.stack.flower || destination[index]!.quality.id !== drag.stack.quality.id)) {
            notify('Move harvester output to an empty or matching bag slot');
          } else if (blueprint?.construction && destination !== drag.source) {
            if (!deliverMaterials(drag.source, drag.index, destination, index, blueprint.construction)) notify('Construction needs Uncommon or better flowers · 10 total');
          } else if (fromBlueprint && destination !== drag.source && destination[index] && (destination[index]!.flower !== drag.stack.flower || destination[index]!.quality.id !== drag.stack.quality.id)) {
            notify('Return construction materials to an empty or matching slot');
          } else moveStack(drag.source, drag.index, destination, index);
        }
      } else if (!drag.swept && drag.ctrl && (drag.stack || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5)) {
        if (drag.stack && drag.source[drag.index] === drag.stack) {
          const destination = otherContainer(drag.source);
          if (destination && !transferMatching(drag.source, drag.index, destination)) notify('No matching stacks fit in the other container');
        } else {
          const source = drag.source;
          const destination = otherContainer(source);
          if (destination && !transferAll(source, destination)) notify('No stacks from this container fit in the other one');
        }
      } else if (!drag.swept && drag.shift && drag.stack && drag.source[drag.index] === drag.stack) {
        const destination = otherContainer(drag.source);
        if (destination && !transferStack(drag.source, drag.index, destination)) notify('This stack does not fit in the other container');
      }
      clear();
      refreshContainers();
    });
    document.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
    return clear;
  }

  return { renderInventory, renderFuel, setupDrag };
}
