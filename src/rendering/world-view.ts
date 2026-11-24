import { Container, Graphics, Sprite, Texture, type Application, type Text } from 'pixi.js';
import { chunkKey, viewChunkBounds, isWaterAt, type ChunkWorld, type WorldChunk } from '../world';
import { overgrowthState } from '../harvest';
import { qualityOrder } from '../assets';
import type { Flower, FlowerId } from '../game/types';
import type { Tile } from '../roots';

type Point = { x: number; y: number };
type ChunkView = { ground: Graphics; decorations: Graphics; flowers: Set<string> };
type WorldViewOptions = {
  app: Application;
  map: Container;
  world: ChunkWorld;
  camera: Point;
  cell: number;
  zoom: () => number;
  tileDecorationsEnabled: () => boolean;
  simulationTime: () => number;
  terrainLayer: Container;
  flowerLayer: Container;
  chunkViews: Map<string, ChunkView>;
  worldTextures: Map<FlowerId, Texture[]>;
  overgrowthQualityTextures: Map<string, Texture>;
  flowers: Map<string, Flower>;
  flowerSprites: Map<string, Sprite>;
  flowerBadges: Map<string, Sprite>;
  fertilityMarks: Map<string, Text>;
  hydrateChunk: (chunk: WorldChunk) => void;
  passiveGrowth: (flower: Flower, seconds: number, start: number) => void;
  drawDesignations: () => void;
  getPointerScreen: () => Point | null;
  setHoveredPoint: (point: Point | null) => void;
  setHoveredTile: (tile: Tile | null) => void;
  getWorldStroke: () => { last: Tile } | null;
  continueWorldStroke: (tile: Tile) => void;
  getDesignationDrag: () => { end: Tile } | undefined;
  drawRootPreview: () => void;
  drawBuildingPreview: () => void;
};

export function createWorldView(options: WorldViewOptions) {
  const { app, map, world, camera, cell, zoom, tileDecorationsEnabled, simulationTime, terrainLayer, flowerLayer, chunkViews,
    worldTextures, overgrowthQualityTextures, flowers, flowerSprites, flowerBadges, fertilityMarks, hydrateChunk, passiveGrowth, drawDesignations,
    getPointerScreen, setHoveredPoint, setHoveredTile, getWorldStroke, continueWorldStroke,
    getDesignationDrag, drawRootPreview, drawBuildingPreview } = options;
  let visibleChunkBounds = '';
  let previousDetailed: boolean | undefined;
  const flowerMarkTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(8, 8, 6, 0, Math.PI * 2);
    context.fill();
    return Texture.from(canvas);
  })();
  const flowerMarkColors: Record<FlowerId, number> = {
    blue: 0x62a9ff,
    yellow: 0xf5d45e,
    purple: 0xc27be0,
    red: 0xf06a65,
  };

  function updateFlowerVisual(flower: Flower) {
    const sprite = flowerSprites.get(`${flower.x},${flower.y}`);
    if (!sprite) return;
    const state = overgrowthState(flower.growth);
    const key = `${flower.x},${flower.y}`;
    const textures = worldTextures.get(flower.id);
    const iconLevel = Math.min(Math.max(1, state.stage), textures?.length ?? 1) - 1;
    const simplified = zoom() < 0.5;
    const texture = simplified ? flowerMarkTexture : textures?.[iconLevel];
    if (texture && sprite.texture !== texture) sprite.texture = texture;
    const size = simplified ? cell * 0.34 : cell;
    sprite.width = size;
    sprite.height = size;
    sprite.alpha = 0.35 + Math.min(1, flower.growth) * 0.65;
    sprite.tint = simplified ? flowerMarkColors[flower.id] : flower.growth >= 1 ? 0xffffff : 0xc1d2ac;

    const qualityId = state.stage >= 5
      ? qualityOrder[Math.min(state.stage - 5, qualityOrder.length - 1)]
      : undefined;
    let badge = flowerBadges.get(key);
    const badgeTexture = qualityId ? overgrowthQualityTextures.get(qualityId) : undefined;
    if (badgeTexture) {
      if (!badge) {
        badge = new Sprite(badgeTexture);
        badge.anchor.set(0.5);
        flowerLayer.addChild(badge);
        flowerBadges.set(key, badge);
      }
      badge.texture = badgeTexture;
      badge.position.set((flower.x + 0.21) * cell, (flower.y + 0.79) * cell);
      badge.width = cell * 0.36;
      badge.height = cell * 0.36;
      badge.alpha = sprite.alpha;
      badge.visible = !simplified;
    } else if (badge) {
      badge.destroy();
      flowerBadges.delete(key);
    }
  }

  function ensureVisibleChunks() {
    const currentZoom = zoom();
    const detailed = currentZoom >= 0.5;
    if (previousDetailed !== undefined && previousDetailed !== detailed)
      for (const key of flowerSprites.keys()) {
        const flower = flowers.get(key);
        if (flower) updateFlowerVisual(flower);
      }
    previousDetailed = detailed;
    const decorationsVisible = detailed && tileDecorationsEnabled();
    for (const view of chunkViews.values()) view.decorations.visible = decorationsVisible;
    const width = app.screen.width / currentZoom, height = app.screen.height / currentZoom;
    const bounds = viewChunkBounds(camera.x, camera.y, width, height, cell);
    const signature = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}:${detailed ? 'detailed' : 'middle'}`;
    if (signature === visibleChunkBounds) return;
    visibleChunkBounds = signature;
    const chunks = world.ensureView(camera.x, camera.y, width, height, cell);
    const visible = new Set(chunks.map((chunk) => chunkKey(chunk.x, chunk.y)));
    for (const [key, view] of chunkViews) {
      if (visible.has(key)) continue;
      view.ground.destroy();
      view.decorations.destroy();
      for (const id of view.flowers) {
        flowerSprites.get(id)?.destroy(); flowerSprites.delete(id);
        flowerBadges.get(id)?.destroy(); flowerBadges.delete(id);
      }
      chunkViews.delete(key);
    }
    for (const chunk of chunks) {
      const key = chunkKey(chunk.x, chunk.y);
      if (chunkViews.has(key)) continue;
      hydrateChunk(chunk);
      const ground = new Graphics();
      const decorations = new Graphics();
      decorations.visible = decorationsVisible;
      ground.tint = 0x808080;
      const ids = new Set<string>();
      for (const tile of chunk.tiles) {
        const px = tile.x * cell, py = tile.y * cell;
        const tileShape = ground.rect(px, py, cell, cell).fill(tile.shade);
        if (detailed) tileShape.stroke({ color: 0x15251e, width: 1, alpha: 0.22 });
        if (decorationsVisible && tile.terrain === 'land' && tile.watering > 0.73 && tile.elevation < 0.65) {
          const detail = (Math.imul(tile.x, 374761393) ^ Math.imul(tile.y, 668265263)) >>> 0;
          const sx = px + 10 + detail % 22, sy = py + 12 + (detail >>> 8) % 20;
          const wetness = Math.min(1, (tile.watering - 0.73) / 0.12);
          if (detail % 3 !== 0) {
            decorations.ellipse(sx, sy + 5, 7, 2.5).fill({ color: 0x44756a, alpha: 0.25 + wetness * 0.3 });
            decorations.moveTo(sx - 4, sy + 5).lineTo(sx + 3, sy + 5).stroke({ color: 0x82a18a, width: 1, alpha: 0.3 });
          }
          decorations.moveTo(sx - 4, sy).lineTo(sx - 5, sy - 7).moveTo(sx - 4, sy).lineTo(sx - 1, sy - 9)
            .stroke({ color: 0x8c9d58, width: 1, alpha: 0.65 });
        }
        if (decorationsVisible && tile.terrain === 'water') {
          decorations.moveTo(px + 13, py + 24).lineTo(px + 28, py + 24).stroke({ color: 0x6da6b2, width: 1, alpha: 0.25 });
          for (const [dx, dy, ax, ay, bx, by] of [[0, -1, 0, 0, cell, 0], [1, 0, cell, 0, cell, cell], [0, 1, 0, cell, cell, cell], [-1, 0, 0, 0, 0, cell]]) {
            if (!isWaterAt(tile.x + dx, tile.y + dy, world.seed)) decorations.moveTo(px + ax, py + ay).lineTo(px + bx, py + by).stroke({ color: 0x71846a, width: 2, alpha: 0.8 });
          }
        }
        if (decorationsVisible && tile.grass) decorations.moveTo(px + 13, py + 17).lineTo(px + 15, py + 12).lineTo(px + 17, py + 18).stroke({ color: tile.watering > 0.6 ? 0x91ac68 : 0xb3ad75, width: 1, alpha: 0.5 });
        if (!tile.flower) continue;
        const id = `${tile.x},${tile.y}`;
        const flower = flowers.get(id)!;
        passiveGrowth(flower, simulationTime() - flower.updatedAt, flower.updatedAt);
        flower.updatedAt = simulationTime();
        const sprite = new Sprite(worldTextures.get(flower.id)![0]);
        sprite.anchor.set(0.5);
        sprite.position.set((flower.x + 0.5) * cell, (flower.y + 0.5) * cell);
        flowerSprites.set(id, sprite);
        flowerLayer.addChild(sprite);
        ids.add(id);
        updateFlowerVisual(flower);
      }
      terrainLayer.addChild(ground, decorations);
      chunkViews.set(key, { ground, decorations, flowers: ids });
    }
    for (const [id, marker] of fertilityMarks) marker.visible = flowerSprites.has(id);
    drawDesignations();
  }

  function updateCamera() {
    const currentZoom = zoom();
    const halfW = app.screen.width / 2, halfH = app.screen.height / 2;
    map.scale.set(currentZoom);
    map.position.set(halfW - camera.x * currentZoom, halfH - camera.y * currentZoom);
    ensureVisibleChunks();
    const pointer = getPointerScreen();
    if (pointer) {
      const point = map.toLocal(pointer);
      const worldPoint = { x: point.x, y: point.y };
      const tile = { x: Math.floor(point.x / cell), y: Math.floor(point.y / cell) };
      setHoveredPoint(worldPoint);
      setHoveredTile(tile);
      if (getWorldStroke()) continueWorldStroke(tile);
      const drag = getDesignationDrag();
      if (drag) { drag.end = tile; drawDesignations(); }
      drawRootPreview();
      drawBuildingPreview();
    }
  }

  return { ensureVisibleChunks, updateFlowerVisual, updateCamera };
}
