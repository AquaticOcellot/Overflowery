export type Cell = { x: number; y: number };
export type DesignationFlower = string | 'any' | 'avoid';
export type Designation = Cell & { flower: DesignationFlower };

export function rectangleCells(a: Cell, b: Cell) {
  const cells: Cell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  return cells;
}

export function removeDesignationArea(targets: Map<string, Designation>, a: Cell, b: Cell) {
  const removed: Designation[] = [];
  for (const [id, target] of targets) {
    if (target.x < Math.min(a.x, b.x) || target.x > Math.max(a.x, b.x)
      || target.y < Math.min(a.y, b.y) || target.y > Math.max(a.y, b.y)) continue;
    targets.delete(id);
    removed.push(target);
  }
  return removed;
}
