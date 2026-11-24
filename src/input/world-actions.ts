import type { Application, Container } from 'pixi.js';
import type { BuildingIndex } from '../buildings';
import type { Machine, MachineKind, Mode } from '../game/types';
import type { Tile } from '../roots';

type WorldStroke = { pointerId: number; mode: 'harvest' | 'roots' | 'uproot'; last: Tile } | null;
type DesignationDrag = { start: Tile; end: Tile; pointerId: number; erase: boolean } | undefined;
type Point = { x: number; y: number };

type WorldActionOptions = {
  app: Application;
  map: Container;
  cell: number;
  mode: () => Mode;
  rootStart: () => Tile | null;
  setRootStart: (tile: Tile | null) => void;
  worldStroke: () => WorldStroke;
  setWorldStroke: (stroke: WorldStroke) => void;
  designationDrag: () => DesignationDrag;
  setDesignationDrag: (drag: DesignationDrag) => void;
  isErasingDesignations: () => boolean;
  areaPickingUnlocked: () => boolean;
  setPointerScreen: (point: Point | null) => void;
  moveTooltipTo: (x: number, y: number) => void;
  setHoveredPoint: (point: Point | null) => void;
  setHoveredTile: (tile: Tile | null) => void;
  buildingIndex: BuildingIndex<Machine>;
  isBuildingMode: (mode: Mode) => mode is MachineKind;
  cancelAction: () => void;
  drawDesignations: () => void;
  drawRootPreview: () => void;
  drawBuildingPreview: () => void;
  drawNetwork: () => void;
  continueWorldStroke: (tile: Tile) => void;
  clearDesignationRectangle: (a: Tile, b: Tile) => void;
  designateRectangle: (a: Tile, b: Tile) => void;
  clearPaintedRoots: () => void;
  editRoot: (tile: Tile) => void;
  setSelectedMachine: (id: string) => void;
  tileKey: (tile: Tile) => string;
  renderFuel: () => void;
  setPanel: (panel: 'generator') => void;
  addMachine: (x: number, y: number, kind: MachineKind) => void;
  harvestFlower: (tile: Tile) => void;
  fertilizeFlower: (tile: Tile) => void;
};

export function bindWorldActions(options: WorldActionOptions) {
  const { app, map, cell, mode, rootStart, setRootStart, worldStroke, setWorldStroke, designationDrag, setDesignationDrag,
    isErasingDesignations, areaPickingUnlocked, setPointerScreen, moveTooltipTo, setHoveredPoint, setHoveredTile, buildingIndex, isBuildingMode,
    cancelAction, drawDesignations, drawRootPreview, drawBuildingPreview, drawNetwork, continueWorldStroke,
    clearDesignationRectangle, designateRectangle, clearPaintedRoots, editRoot, setSelectedMachine, tileKey,
    renderFuel, setPanel, addMachine, harvestFlower, fertilizeFlower } = options;

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    cancelAction();
  }, { capture: true });
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cancelAction();
  });

  app.canvas.addEventListener('pointerleave', () => {
    setDesignationDrag(undefined);
    drawDesignations();
    setWorldStroke(null);
    setHoveredTile(null);
    setHoveredPoint(null);
    setPointerScreen(null);
    drawRootPreview();
    drawBuildingPreview();
    drawNetwork();
  });
  const moveTooltipNear = (point: Point) => {
    const rect = app.canvas.getBoundingClientRect();
    moveTooltipTo(rect.left + point.x * rect.width / app.screen.width, rect.top + point.y * rect.height / app.screen.height);
  };
  app.stage.on('pointermove', (event) => {
    setPointerScreen({ x: event.global.x, y: event.global.y });
    moveTooltipNear(event.global);
    const point = map.toLocal(event.global);
    setHoveredPoint({ x: point.x, y: point.y });
    const tile = { x: Math.floor(point.x / cell), y: Math.floor(point.y / cell) };
    setHoveredTile(tile);
    const drag = designationDrag();
    if (drag) { drag.end = tile; drawDesignations(); }
    const stroke = worldStroke();
    if (stroke && event.pointerId === stroke.pointerId) {
      if (!(event.buttons & 1)) setWorldStroke(null);
      else continueWorldStroke(tile);
    }
    drawRootPreview();
    drawBuildingPreview();
  });

  const endStroke = (event: PointerEvent) => {
    const stroke = worldStroke();
    if (event.pointerId === stroke?.pointerId) setWorldStroke(null);
    const drag = designationDrag();
    if (drag?.pointerId !== event.pointerId) return;
    setDesignationDrag(undefined);
    if (event.type === 'pointerup') {
      if (drag.erase) clearDesignationRectangle(drag.start, drag.end);
      else designateRectangle(drag.start, drag.end);
    } else drawDesignations();
  };
  window.addEventListener('pointerup', endStroke);
  window.addEventListener('pointercancel', endStroke);

  app.stage.on('pointerdown', (event) => {
    if (event.button !== 0) return;
    setPointerScreen({ x: event.global.x, y: event.global.y });
    moveTooltipNear(event.global);
    const point = map.toLocal(event.global);
    const tile = { x: Math.floor(point.x / cell), y: Math.floor(point.y / cell) };
    setHoveredTile(tile);
    setHoveredPoint({ x: point.x, y: point.y });
    if (mode() === 'designate') {
      setDesignationDrag({ start: tile, end: tile, pointerId: event.pointerId, erase: isErasingDesignations() });
      drawDesignations();
      return;
    }
    if (mode() === 'roots' || mode() === 'uproot') {
      clearPaintedRoots();
      const start = rootStart();
      if (start && Math.abs(start.x - tile.x) + Math.abs(start.y - tile.y) === 1) {
        editRoot(tile);
        const nextStart = rootStart();
        if (!nextStart || tileKey(nextStart) !== tileKey(tile)) return;
      } else setRootStart(tile);
      setWorldStroke({ pointerId: event.pointerId, mode: mode() as 'roots' | 'uproot', last: tile });
      drawRootPreview();
      drawBuildingPreview();
      return;
    }
    const machine = buildingIndex.at(tile);
    if (machine) {
      setSelectedMachine(tileKey(machine));
      renderFuel();
      setPanel('generator');
      return;
    }
    const currentMode = mode();
    if (isBuildingMode(currentMode)) { addMachine(tile.x, tile.y, currentMode); return; }
    if (currentMode === 'harvest') {
      if (areaPickingUnlocked()) setWorldStroke({ pointerId: event.pointerId, mode: currentMode, last: tile });
      harvestFlower(tile);
      return;
    }
    if (currentMode === 'fertilize') fertilizeFlower(tile);
  });
}
