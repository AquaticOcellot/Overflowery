// Small vector symbols shared by the DOM UI and Pixi's tessellated graphics.
const shapes = {
  flower: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="19" cy="12" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/>',
  burner: '<path d="M5 17h14M7 21h10M8 13V9l2-3V3m4 10V9l2-3V3"/>',
  generator: '<path d="m13 2-8 12h6l-1 8 9-13h-7z"/>',
  composter: '<path d="M5 9h14l-1 12H6L5 9Zm-1-4h16M9 5V2h6v3M9 12v5m6-5v5"/>',
  ash: '<path d="m3 20 5-7 4 3 3-7 6 11H3Zm5-14V3m7 2V2"/>',
  patch: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18m6-18v18"/>',
  research: '<path d="M9 3h6m-5 0v6l-6 10v2h16v-2L14 9V3M7 15h10"/>',
  inventory: '<path d="M4 7h16v14H4zM8 7V3h8v4M4 12h16m-10 0v3h4v-3"/>',
  roots: '<path d="M12 2v20M12 8 5 4M12 13l7-7M12 17l-7-5m7 9 7-6"/>',
  remove: '<path d="m6 6 12 12M6 18 18 6"/>',
  network: '<circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><path d="M8 5h8M6 8l5 8m7-8-5 8"/>',
} as const;

export type IconName = keyof typeof shapes;

export function iconMarkup(name: IconName, color = 'currentColor') {
  return `<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name]}</svg>`;
}

export function initializeIcons() {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
    const name = element.dataset.icon as IconName;
    if (Object.hasOwn(shapes, name)) element.innerHTML = iconMarkup(name);
  });
}
