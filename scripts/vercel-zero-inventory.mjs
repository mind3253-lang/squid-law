#!/usr/bin/env node
// VERCEL ZERO: read-only source inventory. Never prints environment values.
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const ignore=new Set(['.git','node_modules','.next','dist','build','coverage','.vercel']);
const categories=[
 ['vercel_packages',/['"]@vercel\/(?:blob|functions|[^'"]+)['"]/g],
 ['vercel_env_names',/\b(?:VERCEL_[A-Z0-9_]+|BLOB_READ_WRITE_TOKEN)\b/g],
 ['vercel_urls',/https?:\/\/[^\s"'<>]*vercel[^\s"'<>]*/gi],
 ['vercel_host_logic',/\b(?:waitUntil|VERCEL_URL|VERCEL_PROJECT_PRODUCTION_URL)\b/g],
 ['vercel_blob_calls',/\b(?:get|put|list|del|head|copy)\s*\(/g]
];
const entries=[];
async function walk(dir){
 for(const d of await readdir(dir,{withFileTypes:true})){
  if(ignore.has(d.name))continue;
  const full=path.join(dir,d.name);
  if(d.isDirectory()){await walk(full);continue}
  if(!d.isFile()||!(/\.(?:js|mjs|cjs|ts|tsx|jsx|json|html|yml|yaml|md)$/.test(d.name)))continue;
  const relative=path.relative(root,full).replaceAll(path.sep,'/');
  if(relative.startsWith('docs/VERCEL_ZERO_'))continue;
  const content=await readFile(full,'utf8');
  const hits=[];
  for(const [kind,re] of categories){
   re.lastIndex=0;
   let match;
   while((match=re.exec(content))!==null){
    // Names only; never include matched text or file contents in output.
    const line=content.slice(0,match.index).split('\n').length;
    hits.push({kind,line});
    if(hits.length>2000)break;
   }
  }
  if(hits.length)entries.push({path:relative,hits});
 }
}
await walk(root);
entries.sort((a,b)=>a.path.localeCompare(b.path));
const counts=Object.fromEntries(categories.map(([name])=>[name,entries.reduce((n,e)=>n+e.hits.filter(h=>h.kind===name).length,0)]));
const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
const report={
 schema:'vercel-zero-inventory-v1',
 counts,
 vercelConfig:{rewrites:config.rewrites?.length??0,crons:(config.crons??[]).map(x=>({path:x.path,schedule:x.schedule})),hasInstallCommand:Boolean(config.installCommand)},
 files:entries
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
