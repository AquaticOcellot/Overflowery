import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const modules = new Map();
const moduleURLs = new Map();

export function loadTS(url) {
  const key = url.href;
  if (modules.has(key)) return modules.get(key);
  const module = compileAndLoad(url);
  modules.set(key, module);
  return module;
}

async function compileAndLoad(url) {
  let { outputText } = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });

  const imports = [...outputText.matchAll(/from ['"](\.[^'"]+)['"]/g)];
  for (const match of imports) {
    const dependency = new URL(match[1], url);
    if (!/\.[cm]?[jt]sx?$/i.test(dependency.pathname)) dependency.pathname += '.ts';
    await loadTS(dependency);
    outputText = outputText.replaceAll(match[0], `from '${moduleURLs.get(dependency.href)}'`);
  }

  const moduleURL = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  moduleURLs.set(url.href, moduleURL);
  return import(moduleURL);
}
