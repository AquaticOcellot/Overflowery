import type { Application } from 'pixi.js';
import type { Mode } from '../game/types';

type NavigationOptions = {
  app: Application;
  camera: { x: number; y: number };
  keys: Set<string>;
  zoom: () => number;
  setZoom: (zoom: number) => void;
  zoomReadout: HTMLButtonElement;
  zoomRangeToggle: HTMLButtonElement;
  updateCamera: () => void;
  cancelAction: () => void;
  mode: () => Mode;
  isBuildingMode: (mode: Mode) => boolean;
  rotateBuilding: () => void;
  onBlur: () => void;
};

export function bindNavigationControls(options: NavigationOptions) {
  const { app, camera, keys, zoom, setZoom, zoomReadout, zoomRangeToggle, updateCamera, cancelAction, mode, isBuildingMode, rotateBuilding, onBlur } = options;

  const standardZoom = { min: 0.5, max: 2.5 };
  const extendedZoom = { min: 0.1, max: 10 };
  const zoomBounds = () => zoomRangeToggle.getAttribute('aria-pressed') === 'true' ? extendedZoom : standardZoom;
  const updateZoomReadout = () => { zoomReadout.textContent = `${Math.round(zoom() * 100)}%`; };

  app.renderer.on('resize', updateCamera);
  zoomReadout.addEventListener('click', () => {
    setZoom(1);
    updateZoomReadout();
    updateCamera();
  });
  zoomRangeToggle.addEventListener('click', () => {
    const extended = zoomRangeToggle.getAttribute('aria-pressed') !== 'true';
    zoomRangeToggle.setAttribute('aria-pressed', String(extended));
    const bounds = zoomBounds();
    setZoom(Math.max(bounds.min, Math.min(bounds.max, zoom())));
    zoomRangeToggle.dataset.help = extended
      ? 'Extended zoom is active: zoom ranges from 10% to 1000%. Click to return to the standard 50%–250% range.'
      : 'Standard zoom is active: zoom ranges from 50% to 250%. Click to allow zoom from 10% to 1000%.';
    updateZoomReadout();
    updateCamera();
  });
  app.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const currentZoom = zoom();
    const rect = app.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * app.screen.width / rect.width;
    const y = (event.clientY - rect.top) * app.screen.height / rect.height;
    const worldX = camera.x + (x - app.screen.width / 2) / currentZoom;
    const worldY = camera.y + (y - app.screen.height / 2) / currentZoom;
    const bounds = zoomBounds();
    const nextZoom = Math.max(bounds.min, Math.min(bounds.max, currentZoom * Math.exp(-event.deltaY * 0.001)));
    setZoom(nextZoom);
    camera.x = worldX - (x - app.screen.width / 2) / nextZoom;
    camera.y = worldY - (y - app.screen.height / 2) / nextZoom;
    updateZoomReadout();
    updateCamera();
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'escape') { event.preventDefault(); cancelAction(); return; }
    if ((event.target as HTMLElement)?.closest('select, input, textarea')) return;
    if (key === 'r' && !event.repeat && isBuildingMode(mode())) { event.preventDefault(); rotateBuilding(); return; }
    if ('wasd'.includes(key)) { event.preventDefault(); keys.add(key); }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); onBlur(); });
}
