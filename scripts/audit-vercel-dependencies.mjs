#!/usr/bin/env node
// Read-only exhaustive Vercel runtime dependency scan. No credentials or network calls.
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
const root=process.cwd();
const ignore=new Set(['.git','node_modules','.vercel','dist','build','coverage']);
const runtimeDirs=new Set(['api','lib','server','worker','admin','deploy']);
const runtimeFiles=new Set(['middleware.js','package.json','package-lock.json']);
const patterns=[
 ['package',/@vercel\\/|\\bvercel\\s+(?:build|deploy|dev)\\b/gi],
 ['endpoint',/api\\.vercel\\.com|\\b[a-z0-9-]+\\.vercel\\.app\\b/gi],
 ['credential',/SKYNET_VERCEL_TOKEN|BLOB_READ_WRITE_TOKEN|VERCEL_PROJECT_PRODUCTION_URL|VERCEL_URL/g],
 ['tool',/vercel\\.(?:deploy|inspect|logs)/g],
 ['blob',/\\b(?:vercelBlob|vercel_blob|vercelStorage)\\b/gi]
];
const findings=[];let scanned=0;
function walk(dir){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(ignore.has(item.name))continue;
  const full=join(dir,item.name),p=relative(root,full).replaceAll('\\\\','/');
  if(item.isDirectory()){walk(full);continue}
  if(!item.isFile()||!(/\\.(?:js|mjs|cjs|ts|tsx|jsx|json|html|yml|yaml|sh)$/.test(p)))continue;
  if(p.startsWith('scripts/')||p.startsWith('tests/')||p.startsWith('docs/')||p.startsWith('fixtures/'))continue;
  scanned++;
  const source=readFileSync(full,'utf8');
  for(const [kind,re] of patterns){
   re.lastIndex=0;let match;
   while((match=re.exec(source))!==null){
    findings.push({path:p,line:source.slice(0,match.index).split('\\n').length,kind});
    if(findings.length>2000)throw Error('TOO_MANY_FINDINGS');
   }
  }
 }
}
walk(root);
findings.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line);
console.log(JSON.stringify({scanned,findings:findings.length,details:findings},null,2));
if(findings.length)process.exitCode=1;
