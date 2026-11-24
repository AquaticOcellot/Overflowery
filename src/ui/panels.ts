import type { Panel } from '../game/types';

type ResearchItem = { id: string; name: string; cost: number; description: string; repeatable?: boolean };
type PanelUiOptions = {
  research: ResearchItem[];
  researched: Set<string>;
  researchLevels: Map<string, number>;
  energy: () => number;
  setActivePanel: (panel: Panel) => void;
  researchList: HTMLElement;
  inventoryMenu: HTMLElement;
  researchMenu: HTMLElement;
  generatorMenu: HTMLElement;
  inventoryToggle: HTMLButtonElement;
  researchToggle: HTMLButtonElement;
  fieldNotesView: HTMLElement;
  showFieldNotes: () => void;
  formatEnergy: (joules: number) => string;
  buyResearch: (id: string) => void;
};

export function createPanelUi(options: PanelUiOptions) {
  const { research, researched, researchLevels, energy, setActivePanel, researchList, inventoryMenu, researchMenu,
    generatorMenu, inventoryToggle, researchToggle, fieldNotesView, showFieldNotes, formatEnergy, buyResearch } = options;

  function renderResearch() {
    const breedingLevel = researchLevels.get('selective-breeding') ?? 0;
    const summary = `Selective Breeding · ${breedingLevel} levels · +${breedingLevel} percentage points to base odds`;
    const cards = research.map((tech) => {
      const level = researchLevels.get(tech.id) ?? 0;
      const done = !tech.repeatable && researched.has(tech.id);
      const cost = tech.repeatable ? Math.ceil(tech.cost * 1.5 ** level) : tech.cost;
      const canBuy = energy() >= cost;
      return `<div class="research-card${done ? ' done' : ''}">
        <span class="research-copy"><b>${tech.name}${tech.repeatable ? ` · Level ${level}` : ''}</b><small>${tech.description}</small></span>
        <button class="research-buy" type="button" data-tech="${tech.id}" ${done || !canBuy ? 'disabled' : ''}>${done ? 'Done' : formatEnergy(cost)}</button>
      </div>`;
    }).join('');
    researchList.innerHTML = `<div class="research-summary" aria-live="polite">${summary}</div>${cards}`;
    researchList.querySelectorAll<HTMLButtonElement>('.research-buy:not(:disabled)').forEach((button) => {
      button.addEventListener('click', () => buyResearch(button.dataset.tech!));
    });
  }

  function setPanel(panel: Panel) {
    setActivePanel(panel);
    if (panel === 'research') renderResearch();
    fieldNotesView.hidden = panel !== 'notes';
    document.querySelector('#notes-toggle')!.setAttribute('aria-expanded', String(panel === 'notes'));
    if (panel === 'notes') showFieldNotes();
    inventoryMenu.hidden = panel !== 'inventory' && panel !== 'generator';
    researchMenu.hidden = panel !== 'research';
    generatorMenu.hidden = panel !== 'generator';
    inventoryToggle.setAttribute('aria-expanded', String(panel === 'inventory' || panel === 'generator'));
    researchToggle.setAttribute('aria-expanded', String(panel === 'research'));
  }

  function setBuildingMenu(open: boolean) {
    document.querySelector<HTMLElement>('#building-menu')!.hidden = !open;
    const toggle = document.querySelector<HTMLButtonElement>('#build-toggle')!;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('active', open);
  }

  return { renderResearch, setPanel, setBuildingMenu };
}
