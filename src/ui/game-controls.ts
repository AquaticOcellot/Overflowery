import type { SimulationSpeed } from '../speed';
import type { FlowerId, Panel, Mode } from '../game/types';
import type { RootKind } from '../roots';
import { iconMarkup } from '../icons';
import type { DesignationFlower } from '../designations';

type FlowerChoice = { id: FlowerId; name: string };
type GameControlsOptions = {
  kinds: FlowerChoice[];
  designationIcons: Record<FlowerId, string>;
  simulationSpeed: SimulationSpeed;
  inventoryToggle: HTMLButtonElement;
  inventoryMenu: HTMLElement;
  researchToggle: HTMLButtonElement;
  activePanel: () => Panel;
  setPanel: (panel: Panel) => void;
  setMode: (mode: Mode) => void;
  isUprooting: () => boolean;
  setBuildingMenu: (open: boolean) => void;
  designatedFlower: () => DesignationFlower;
  setDesignatedFlower: (flower: DesignationFlower) => void;
  setDesignationErase: (erase: boolean) => void;
  isErasingDesignations: () => boolean;
  rotateBuilding: () => void;
  setRootKind: (kind: RootKind) => void;
  clearRootStart: () => void;
  clearPaintedRoots: () => void;
  clearWorldStroke: () => void;
  drawRootPreview: () => void;
  drawBuildingPreview: () => void;
  drawNetwork: () => void;
  showResources: () => boolean;
  setShowResources: (show: boolean) => void;
};

export function bindGameControls(options: GameControlsOptions) {
  const { kinds, designationIcons, simulationSpeed, inventoryToggle, inventoryMenu, researchToggle, activePanel,
    setPanel, setMode, isUprooting, setBuildingMenu, designatedFlower, setDesignatedFlower, setDesignationErase,
    isErasingDesignations, rotateBuilding, setRootKind, clearRootStart, clearPaintedRoots,
    clearWorldStroke, drawRootPreview, drawBuildingPreview, drawNetwork, showResources, setShowResources } = options;

  inventoryToggle.addEventListener('click', () => {
    if (activePanel() === 'generator') {
      inventoryMenu.hidden = !inventoryMenu.hidden;
      inventoryToggle.setAttribute('aria-expanded', String(!inventoryMenu.hidden));
    } else setPanel(activePanel() === 'inventory' ? null : 'inventory');
  });
  document.querySelector('#notes-toggle')!.addEventListener('click', () => setPanel(activePanel() === 'notes' ? null : 'notes'));
  researchToggle.addEventListener('click', () => setPanel(activePanel() === 'research' ? null : 'research'));
  document.querySelector<HTMLButtonElement>('#tool-designate')!.addEventListener('click', () => setMode('designate'));

  const speciesButtons = document.querySelector<HTMLElement>('#designation-species')!;
  speciesButtons.innerHTML = kinds.map(kind => `<button type="button" class="notes-choice" data-species="${kind.id}" aria-label="${kind.name}" aria-pressed="${kind.id === designatedFlower()}"><img src="${designationIcons[kind.id]}" alt=""></button>`).join('');
  speciesButtons.querySelectorAll<HTMLButtonElement>('[data-species]').forEach(button => button.addEventListener('click', () => {
    const flower = button.dataset.species as FlowerId;
    setDesignatedFlower(flower);
    setDesignationErase(false);
    updateDesignationChoices(flower);
  }));
  const anyButton = document.querySelector<HTMLButtonElement>('#designation-any')!;
  const avoidButton = document.querySelector<HTMLButtonElement>('#designation-avoid')!;
  function updateDesignationChoices(selected: DesignationFlower) {
    speciesButtons.querySelectorAll<HTMLButtonElement>('[data-species]').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.species === selected)));
    anyButton.setAttribute('aria-pressed', String(selected === 'any'));
    avoidButton.setAttribute('aria-pressed', String(selected === 'avoid'));
  }
  anyButton.addEventListener('click', () => {
    setDesignatedFlower('any');
    setDesignationErase(false);
    updateDesignationChoices('any');
  });
  avoidButton.addEventListener('click', () => {
    setDesignatedFlower('avoid');
    setDesignationErase(false);
    updateDesignationChoices('avoid');
  });
  document.querySelector('#clear-designations')!.innerHTML = iconMarkup('remove');
  document.querySelector('#clear-designations')!.addEventListener('click', () => setDesignationErase(!isErasingDesignations()));
  document.querySelector<HTMLButtonElement>('#tool-harvest')!.addEventListener('click', () => setMode('harvest'));
  document.querySelector<HTMLButtonElement>('#build-toggle')!.addEventListener('click', () => {
    const open = document.querySelector<HTMLElement>('#building-menu')!.hidden;
    setMode('harvest');
    setBuildingMenu(open);
  });
  document.querySelector<HTMLButtonElement>('#tool-small-burner')!.addEventListener('click', () => setMode('small-burner'));
  document.querySelector<HTMLButtonElement>('#tool-burner')!.addEventListener('click', () => setMode('burner'));
  document.querySelector<HTMLButtonElement>('#tool-generator')!.addEventListener('click', () => setMode('generator'));
  document.querySelector<HTMLButtonElement>('#tool-battery')!.addEventListener('click', () => setMode('battery'));
  document.querySelector<HTMLButtonElement>('#tool-composter')!.addEventListener('click', () => setMode('composter'));
  document.querySelector<HTMLButtonElement>('#tool-harvester')!.addEventListener('click', () => setMode('harvester'));
  document.querySelector<HTMLButtonElement>('#tool-fertilize')!.addEventListener('click', () => setMode('fertilize'));
  document.querySelector<HTMLButtonElement>('#tool-roots')!.addEventListener('click', () => setMode('roots'));
  document.querySelector<HTMLButtonElement>('#building-rotate')!.addEventListener('click', rotateBuilding);
  document.querySelector<HTMLButtonElement>('[data-root-action="uproot"]')!.addEventListener('click', () => setMode(isUprooting() ? 'roots' : 'uproot'));
  document.querySelectorAll<HTMLButtonElement>('[data-root-kind]').forEach(button => button.addEventListener('click', () => {
    const kind = button.dataset.rootKind as RootKind;
    if (!isUprooting()) setMode('roots');
    setRootKind(kind);
    clearRootStart();
    clearPaintedRoots();
    clearWorldStroke();
    document.querySelectorAll<HTMLButtonElement>('[data-root-kind]').forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.rootKind === kind)));
    if (!isUprooting()) document.querySelector<HTMLButtonElement>('[data-root-action="uproot"]')!.setAttribute('aria-pressed', 'false');
    drawRootPreview();
    drawBuildingPreview();
  }));

  const speedControl = document.querySelector<HTMLButtonElement>('#speed-control')!;
  const speedLabel = (multiplier: number) => `${multiplier}×`;
  const updateSpeedControls = () => {
    const speed = speedLabel(simulationSpeed.multiplier);
    speedControl.textContent = speed;
    speedControl.setAttribute('aria-label', `Simulation speed ${speed}`);
    speedControl.dataset.help = `Current speed: ${speed}. Left-click to increase by 10×, up to 100×. Right-click to decrease by 10×, down to 0.1×.`;
  };
  speedControl.addEventListener('click', () => { simulationSpeed.increase(); updateSpeedControls(); });
  speedControl.addEventListener('contextmenu', event => {
    event.preventDefault();
    simulationSpeed.decrease();
    updateSpeedControls();
  });
  updateSpeedControls();
  document.querySelector<HTMLButtonElement>('#heat-toggle')!.addEventListener('click', (event) => {
    const show = !showResources();
    setShowResources(show);
    (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(show));
    drawNetwork();
  });
}
