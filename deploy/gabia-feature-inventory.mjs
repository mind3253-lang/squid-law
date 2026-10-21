// Read-only source audit for moving every SQUIDLAW/SKYNET function off Vercel.
// Run: node deploy/gabia-feature-inventory.mjs
import {readdir,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const root=new URL('../',import.meta.url);
const folders=['api','server','worker','lib','public'];
const matches=[];
const markers=[
 ['vercel-runtime',/from\s*['"]@vercel\/(?:functions|node)['"]|require\(['"]@vercel\/(?:functions|node)['"]\)/],
 ['vercel-blob',new RegExp('@'+'vercel/blob|BLOB_'+'READ_WRITE_TOKEN')],
 ['vercel-operations',/api\.vercel\.com|VERCEL_TOKEN|vercel\.app/],
 ['neon-database',/neon\.tech|NEON_DATABASE_URL/],
 ['serverless-handler',/export\s+default\s+(?:async\s+)?function\s+handler|export\s+default\s+handler/]
];
async function walk(dir){
 let items;try{items=await readdir(new URL(dir,root),{withFileTypes:true})}catch{return}
 for(const item of items){
  const name=join(dir,item.name);
  if(item.isDirectory()){await walk(name);continue}
  if(!/\.(?:js|mjs|cjs|html|json)$/.test(item.name))continue;
  const source=await readFile(new URL(name,root),'utf8');
  const tags=markers.filter(([,rx])=>rx.test(source)).map(([tag])=>tag);
  if(tags.length)matches.push({file:name.replaceAll('\\','/'),tags});
 }
}
for(const folder of folders)await walk(folder);
matches.sort((a,b)=>a.file.localeCompare(b.file));
const counts=Object.fromEntries(markers.map(([tag])=>[tag,matches.filter(x=>x.tags.includes(tag)).length]));
console.log(JSON.stringify({mode:'source-only-no-network-no-secrets',counts,files:matches},null,2));
