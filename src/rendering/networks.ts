import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { buildingTiles, type BuildingIndex } from '../buildings';
import { rootKinds, rootStats, type Root, type RootKind, type RootNetwork, type Tile } from '../roots';
import type { Machine } from '../game/types';

type Point = { x: number; y: number };
type NetworkDrawingOptions = {
  cell: number;
  rootLayer: Graphics;
  rootPreview: Graphics;
  resourceLayer: Graphics;
  rootBadgeLayer: Container;
  rootBadgeSprites: Map<Root, Sprite>;
  rootQualityTextures: Texture[];
  networks: RootNetwork[];
  heatNetwork: RootNetwork;
  powerNetwork: RootNetwork;
  waterNetwork: RootNetwork;
  nutrientNetwork: RootNetwork;
  buildingIndex: BuildingIndex<Machine>;
  zoom: () => number;
  hoveredPoint: () => Point | null;
  hoveredTile: () => Tile | null;
  rootStart: () => Tile | null;
  rootKind: () => RootKind;
  showResources: () => boolean;
};

export function createNetworkDrawing(options: NetworkDrawingOptions) {
  const { cell, rootLayer, rootPreview, resourceLayer, rootBadgeLayer, rootBadgeSprites, rootQualityTextures,
    networks, heatNetwork, powerNetwork, waterNetwork, nutrientNetwork, buildingIndex, zoom, hoveredPoint,
    hoveredTile, rootStart, rootKind, showResources } = options;

  function drawRootPreview() {
    rootPreview.clear();
    const start = rootStart();
    if (!start) return;
    rootPreview.rect(start.x * cell + 2, start.y * cell + 2, cell - 4, cell - 4).stroke({ color: 0xe2ef9a, width: 2 });
    const hover = hoveredTile();
    if (!hover) return;
    const valid = Math.abs(start.x - hover.x) + Math.abs(start.y - hover.y) === 1;
    rootPreview.moveTo((start.x + 0.5) * cell, (start.y + 0.5) * cell)
      .lineTo((hover.x + 0.5) * cell, (hover.y + 0.5) * cell)
      .stroke({ color: valid ? rootKinds[rootKind()].color : 0xe87575, width: 3, alpha: 0.8 });
  }

  function drawRootLinks() {
    let inspectedRoot: Root | undefined;
    let nearest = 8 / zoom();
    const point = hoveredPoint();
    const roots = networks.flatMap((network) => [...network.roots.values()]);
    const liveRoots = new Set(roots);
    for (const [root, badge] of rootBadgeSprites) {
      if (!liveRoots.has(root)) { badge.destroy(); rootBadgeSprites.delete(root); }
    }
    for (const root of roots) {
      const stats = rootStats(root);
      const color = rootKinds[root.kind].color;
      const offset = root.kind === 'nutrient' ? 8 : root.kind === 'heat' ? -8 : 0;
      const ax = (root.a.x + 0.5) * cell + offset, ay = (root.a.y + 0.5) * cell + offset;
      const bx = (root.b.x + 0.5) * cell + offset, by = (root.b.y + 0.5) * cell + offset;
      const width = 1 + stats.level;
      rootLayer.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0x10150d, width: width + 3 });
      rootLayer.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width, alpha: 0.4 + stats.level * 0.12 });
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const horizontal = ay === by;
      const badgeOffset = root.kind === 'heat' ? -4 : root.kind === 'nutrient' ? 4 : 0;
      const badgeX = mx + (horizontal ? 0 : badgeOffset), badgeY = my + (horizontal ? badgeOffset : 0);
      let badge = rootBadgeSprites.get(root);
      if (!badge) {
        badge = new Sprite(rootQualityTextures[stats.level - 1]);
        badge.anchor.set(0.5);
        badge.width = badge.height = 14;
        rootBadgeSprites.set(root, badge);
        rootBadgeLayer.addChild(badge);
      }
      badge.texture = rootQualityTextures[stats.level - 1];
      badge.position.set(badgeX, badgeY);
      if (point) {
        const t = Math.max(0, Math.min(1, ((point.x - ax) * (bx - ax) + (point.y - ay) * (by - ay)) / (cell * cell)));
        const distance = Math.min(Math.hypot(point.x - ax - t * (bx - ax), point.y - ay - t * (by - ay)), Math.max(0, Math.hypot(point.x - badgeX, point.y - badgeY) - 7));
        if (distance < nearest) { nearest = distance; inspectedRoot = root; }
      }
    }
    return inspectedRoot;
  }

  function drawResourceOverlay() {
    resourceLayer.clear();
    if (!showResources()) return;
    for (const [key, heat] of heatNetwork.stored) {
      const [x, y] = key.split(',').map(Number);
      const machine = buildingIndex.at({ x, y });
      for (const tile of machine ? buildingTiles(machine) : [{ x, y }]) {
        resourceLayer.rect(tile.x * cell + 1, tile.y * cell + 1, cell - 2, cell - 2)
          .fill({ color: 0xff7f32, alpha: 0.08 + 0.5 * heat / heatNetwork.capacity(tile) });
      }
    }
    for (const [key, nutrients] of nutrientNetwork.stored) {
      const [x, y] = key.split(',').map(Number);
      resourceLayer.circle((x + 0.8) * cell, (y + 0.2) * cell, 2 + 5 * nutrients / 20).fill(0x89d867);
    }
    for (const [key, joules] of powerNetwork.stored) {
      if (!joules) continue;
      const [x, y] = key.split(',').map(Number);
      resourceLayer.rect(x * cell + 8, y * cell + 37, 32 * joules / powerNetwork.capacity({ x, y }), 3).fill(0x61dfe5);
    }
    for (const [key, water] of waterNetwork.stored) {
      if (!water) continue;
      const [x, y] = key.split(',').map(Number);
      resourceLayer.circle((x + .2) * cell, (y + .2) * cell, 2 + 5 * water / waterNetwork.capacity({ x, y })).fill(0x61dfe5);
    }
  }

  function draw() {
    rootLayer.clear();
    const inspectedRoot = drawRootLinks();
    drawResourceOverlay();
    return inspectedRoot;
  }

  return { draw, drawRootPreview };
}
