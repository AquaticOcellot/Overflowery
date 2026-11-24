type Tile = { x: number; y: number };

// Follow a sampled stroke with a staircase of adjacent cells; exclude its starting cell.
export function strokeTiles(from: Tile, to: Tile): Tile[] {
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y);
  let x = from.x, y = from.y, ix = 0, iy = 0;
  const tiles: Tile[] = [];
  while (ix < dx || iy < dy) {
    if (ix < dx && (iy >= dy || (2 * ix + 1) * dy <= (2 * iy + 1) * dx)) { x += sx; ix++; }
    else { y += sy; iy++; }
    tiles.push({ x, y });
  }
  return tiles;
}
