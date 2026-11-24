// Small vector symbols shared by the DOM UI and Pixi's tessellated graphics.
const shapes = {
  heatRoot: '<path d="M12 11v11m0-6-7-4m7 7 7-6M9 9c-3-3 1-5 3-7-1 4 5 4 4 7-1 3-6 3-7 0Z"/>',
  utilityRoot: '<path d="M12 13v9m0-5-7-4m7 7 7-5M8 8c0-2 4-6 4-6s4 4 4 6a4 4 0 0 1-8 0Zm4-3-2 4h3l-1 3"/>',
  nutrientRoot: '<path d="M12 12v10m0-5-7-4m7 7 7-5M12 12C5 11 4 6 5 3c6 0 10 3 7 9Zm0 0 6-8M13 9c0-5 3-7 7-7 1 5-1 9-7 7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  rotate: '<path d="M20 7v6h-6M20 13a8 8 0 1 0-2 5"/>',
  flower: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="19" cy="12" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/>',
  burner: '<path d="M5 17h14M7 21h10M8 13V9l2-3V3m4 10V9l2-3V3"/>',
  generator: '<path d="m13 2-8 12h6l-1 8 9-13h-7z"/>',
  battery: '<rect x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M7 10v4m4-4v4m4-4v4"/>',
  composter: '<path d="M5 9h14l-1 12H6L5 9Zm-1-4h16M9 5V2h6v3M9 12v5m6-5v5"/>',
  harvester: '<path d="M4 20h16M6 17l2-5 4 2 4-8 3 2"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="6" r="1"/>',
  buildings: '<path d="M3 21V8l7-4v17M10 10h11v11M6 9h1m-1 4h1m-1 4h1m7-3h1m3 0h1m-5 4h1m3 0h1M2 21h20"/>',
  designation: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18m6-18v18"/><circle cx="12" cy="12" r="2.3"/>',
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
