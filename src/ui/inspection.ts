import { overgrowthState } from '../harvest';
import { formatEnergy } from '../energy';
import { rootKinds, rootStats, tileKey, type Root, type RootNetwork, type Tile } from '../roots';
import type { ChunkWorld } from '../world';
import type { PlantMovement } from '../plant-movement';
import type { Flower, Quality } from '../game/types';

type InspectionOptions = {
  world: ChunkWorld;
  flowers: Map<string, Flower>;
  heatNetwork: RootNetwork;
  powerNetwork: RootNetwork;
  waterNetwork: RootNetwork;
  nutrientNetwork: RootNetwork;
  plantMovement: PlantMovement<Flower>;
  qualities: Quality[];
  tooltip: HTMLElement;
  rootReadout: HTMLElement;
  tileReadout: HTMLElement;
};

export function createInspectionReadout(options: InspectionOptions) {
  const { world, flowers, heatNetwork, powerNetwork, waterNetwork, nutrientNetwork, plantMovement,
    qualities, tooltip, rootReadout, tileReadout } = options;
  let cursor: { x: number; y: number } | undefined;
  let inspectedRoot: Root | undefined;
  let hoveredTile: Tile | null = null;
  let interfaceHelp: string | undefined;

  function positionAtCursor() {
    if (!cursor || tooltip.hidden) return;
    const gap = 14;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    let left = cursor.x + gap;
    let top = cursor.y + gap;
    if (left + width + 8 > window.innerWidth) left = cursor.x - width - gap;
    if (top + height + 8 > window.innerHeight) top = cursor.y - height - gap;
    tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
  }

  function moveToCursor(x: number, y: number) {
    cursor = { x, y };
    positionAtCursor();
  }

  function render() {
    if (interfaceHelp) {
      tooltip.hidden = false;
      tileReadout.textContent = interfaceHelp;
      rootReadout.textContent = '';
      positionAtCursor();
      return;
    }
    tooltip.hidden = !hoveredTile;
    if (inspectedRoot) {
      const stats = rootStats(inspectedRoot);
      const rate = inspectedRoot.kind !== 'nutrient' ? `${formatEnergy(stats.throughput).replace('kJ', 'kW').replace(' J', ' W')}` : `${stats.throughput} nutrients/s`;
      const remaining = inspectedRoot.kind === 'heat' ? formatEnergy(stats.untilNext) : `${stats.untilNext.toFixed(2)} nutrients`;
      if (inspectedRoot.kind === 'utility') {
        const waterRate = waterNetwork.transferRate(inspectedRoot);
        rootReadout.textContent = [
          `Water/power root · Level ${stats.level}/5`,
          `Shared power: consumers → batteries → generators`,
          `${waterRate.toFixed(1)} water/s`,
          stats.level === 5 ? 'Max level' : `Repaint: ${stats.upgradeCost} Common or better flowers`,
          'Water: lossless · Power: 0.1% loss/s',
        ].join('\n');
      } else rootReadout.textContent = [
        `${rootKinds[inspectedRoot.kind].name} root · ${qualities[stats.level - 1].name} · Level ${stats.level}/5`,
        `${rate} limit · ${Math.abs(inspectedRoot.elevationDelta) < 0.00001 ? 'Level terrain' : inspectedRoot.kind === 'heat' ? 'Uphill favored' : 'Downhill favored'}`,
        stats.level === 5 ? 'Max level' : `${Math.floor(stats.progress * 100)}% to next · move ${remaining} more`,
      ].join('\n');
    } else rootReadout.textContent = '';
    if (hoveredTile) {
      const flower = flowers.get(tileKey(hoveredTile));
      const tile = world.getTile(hoveredTile.x, hoveredTile.y);
      const lines = [
        `Tile ${hoveredTile.x}, ${hoveredTile.y} · ${tile.terrain === 'water' ? 'Water' : 'Land'}`,
        `Elevation ${(tile.elevation * 100).toFixed(1)}% · Watering ${Math.round(tile.watering * 100)}%`,
        `Heat ${formatEnergy(heatNetwork.amount(hoveredTile))} · Power ${formatEnergy(powerNetwork.amount(hoveredTile))}`,
        `Water ${waterNetwork.amount(hoveredTile).toFixed(1)} · Nutrients ${nutrientNetwork.amount(hoveredTile).toFixed(1)} / 20`,
      ];
      if (flower) {
        const movement = plantMovement.status(flower);
        const growth = flower.growth < 1
          ? `${Math.floor(flower.growth * 100)}% grown`
          : `Stage ${overgrowthState(flower.growth).stage} · ${flower.harvest?.qualities.length ?? overgrowthState(flower.growth).rolls} harvest rolls · ${Math.floor(overgrowthState(flower.growth).progress * 100)}% to next stage`;
        lines.push(movement ? `Flower · ${movement}` : `Flower · ${growth}`);
      }
      tileReadout.textContent = lines.join('\n');
    }
    positionAtCursor();
  }

  function update(root: Root | undefined, tile: Tile | null) {
    inspectedRoot = root;
    hoveredTile = tile;
    render();
  }

  document.addEventListener('pointermove', event => {
    const target = event.target;
    const button = target instanceof Element ? target.closest<HTMLElement>('button, [role="button"]') : null;
    if (button) {
      const label = button.getAttribute('aria-label') || button.textContent?.trim().replace(/\s+/g, ' ') || 'Control';
      const help = button.dataset.help || (button.title && button.title !== label ? button.title : '');
      interfaceHelp = help ? `${label}\n${help}` : label;
      hoveredTile = null;
      inspectedRoot = undefined;
      moveToCursor(event.clientX, event.clientY);
      render();
    } else if (target instanceof HTMLCanvasElement) {
      const wasVisible = !!interfaceHelp;
      interfaceHelp = undefined;
      if (wasVisible) render();
    } else {
      const wasVisible = !!interfaceHelp || !!hoveredTile || !tooltip.hidden;
      interfaceHelp = undefined;
      hoveredTile = null;
      inspectedRoot = undefined;
      if (wasVisible) render();
    }
  }, true);

  return { update, moveToCursor };
}
