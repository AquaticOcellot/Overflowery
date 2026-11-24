import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/designations.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { rectangleCells, removeDesignationArea } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const key = t => `${t.x},${t.y}`;
const target = (x, y, flower = 'blue') => ({x,y,flower});

test('rectangle designations include both endpoints in all drag directions and signed coordinates', () => {
  const forward = rectangleCells({x:-2,y:-1},{x:1,y:1});
  assert.deepEqual(forward,rectangleCells({x:1,y:1},{x:-2,y:-1}));
  assert.equal(forward.length,12);
  assert.equal(new Set(forward.map(key)).size,12);
  assert.deepEqual(rectangleCells({x:3,y:4},{x:3,y:4}),[{x:3,y:4}]);
});

test('clearing a rectangle removes only selected cells across species and preserves outside targets', () => {
  const inside = [target(-1,-1),target(0,0,'yellow'),target(1,1)];
  const outside = [target(-2,0),target(2,0),target(0,-2),target(0,2)];
  const map = new Map([...inside,...outside].map(t=>[key(t),t]));
  const removed = removeDesignationArea(map,{x:1,y:1},{x:-1,y:-1});
  assert.deepEqual(new Set(removed),new Set(inside));
  assert.deepEqual([...map.values()],outside);
  assert.equal(removeDesignationArea(map,{x:10,y:10},{x:12,y:12}).length,0);
  assert.equal(map.size,4);
});
