import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const cache=new Map();
export async function loadTS(url){
  const name=url.href;if(cache.has(name))return cache.get(name);
  let {outputText}=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const matches=[...outputText.matchAll(/from ['"](\.[^'"]+)['"]/g)];
  for(const match of matches){const dependency=await moduleURL(new URL(match[1]+'.ts',url));outputText=outputText.replace(match[0],`from '${dependency}'`);}
  const uri=`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;cache.set(name,uri);return import(uri);
}
async function moduleURL(url){await loadTS(url);return cache.get(url.href);}
