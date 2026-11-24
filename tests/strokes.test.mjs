import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/strokes.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { strokeTiles } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('fast strokes visit every intervening tile in both cardinal directions', () => {
  assert.deepEqual(strokeTiles({ x: 0, y: 0 }, { x: 4, y: 0 }), [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
  assert.deepEqual(strokeTiles({ x: 2, y: 3 }, { x: 2, y: 0 }), [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 0 }]);
});

test('diagonal samples create connected orthogonal staircases without skipped endpoints', () => {
  for (const from of [{ x: 0, y: 0 }, { x: 20, y: 12 }]) {
    for (const to of [{ x: 0, y: 0 }, { x: 41, y: 25 }, { x: 3, y: 18 }]) {
      const path = strokeTiles(from, to);
      assert.equal(path.length, Math.abs(from.x - to.x) + Math.abs(from.y - to.y));
      let previous = from;
      for (const tile of path) {
        assert.equal(Math.abs(tile.x - previous.x) + Math.abs(tile.y - previous.y), 1);
        assert.ok(tile.x >= 0 && tile.x <= 41 && tile.y >= 0 && tile.y <= 25);
        previous = tile;
      }
      assert.deepEqual(previous, to);
    }
  }
});

test('holding over the same tile creates no duplicate root links', () => {
  assert.deepEqual(strokeTiles({ x: 5, y: 6 }, { x: 5, y: 6 }), []);
});
