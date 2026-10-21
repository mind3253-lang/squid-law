// Offline migration inventory. No network, credentials, customer data or AI calls.
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
const root=process.cwd();
const skip=new Set(['.git','node_modules','.vercel','dist','build','coverage']);
const needles=[
 ['vercel_host',/api\.vercel\.com|vercel\.app|vercel\.json/gi],
 ['vercel_token',/SKYNET_VERCEL_TOKEN|BLOB_READ_WRITE_TOKEN/g],
 ['vercel_tool',/vercel\.(?:deploy|inspect|logs)/g],
 ['vercel_blob',/@vercel\/blob/g],
 ['vercel_functions',/@vercel\/functions/g],
 ['vercel_runtime',/VERCEL_URL|VERCEL_PROJECT_PRODUCTION_URL/g],
 ['worker_dispatch',/scheduleCustomerWorker/g],
 ['vercel_cron',/customer-analysis-worker|skynet-search-backfill/g],
 ['database_url',/SQUID_CUSTOMER_DATABASE_URL/g],
];
const counts=new Map(needles.map(([n])=>[n,[]]));
function walk(dir){
 for(const name of readdirSync(dir)){
  if(skip.has(name))continue;
  const full=join(dir,name),st=statSync(full);
  if(st.isDirectory()){walk(full);continue}
  if(!st.isFile()||! /\.(mjs|js|json|ts|tsx)$/.test(name))continue;
  const path=relative(root,full).replaceAll('\\','/');
  if(path==='scripts/audit-vercel-dependencies.mjs')continue;
  const source=readFileSync(full,'utf8');
  for(const [category,pattern] of needles){
   const found=[...source.matchAll(pattern)].length;
   if(found)counts.get(category).push({path,occurrences:found});
  }
 }
}
walk(root);
let total=0;
for(const [category,files] of counts){
 if(category.startsWith('vercel_'))total+=files.length;
 console.log(category+': '+files.length+' files');
 for(const f of files.sort((a,b)=>a.path.localeCompare(b.path)))console.log('  '+f.path+' ('+f.occurrences+')');
}

if(total>0){console.error('VERCEL_RUNTIME_RESIDUE_DETECTED');process.exitCode=1}
