#!/usr/bin/env node
// VERCEL ZERO: Gabia static-web staging server.
// This intentionally does NOT claim API parity. All /api routes fail closed.
import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.SQUIDLAW_WEB_ROOT||process.cwd());
const host=process.env.SQUIDLAW_WEB_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_WEB_PORT||3080);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'};
const rewrites=new Map([
 ['/admin/skynet-document-verify','/api/skynet-document-verify'],
 ['/admin/skynet-chat','/api/skynet-chat']
]);
const blocked=new Set(['.git','.github','.env','node_modules','api','lib','worker','scripts','docs','tests','.vercel']);
const blockedFiles=new Set(['package.json','package-lock.json','vercel.json','pnpm-lock.yaml','yarn.lock','README.md']);
function respond(res,status,body,contentType='application/json; charset=utf-8'){
 res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(contentType.startsWith('application/json')?JSON.stringify(body):body);
}
http.createServer(async(req,res)=>{
 if(req.url===undefined)return respond(res,400,{error:'BAD_REQUEST'});
 if(req.method!=='GET'&&req.method!=='HEAD')return respond(res,405,{error:'METHOD_NOT_ALLOWED'});
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return respond(res,400,{error:'BAD_PATH'})}
 if(pathname==='/__health')return respond(res,200,{status:'ok',component:'gabia-static-staging',apiReady:false});
 if(pathname.startsWith('/api/')||rewrites.has(pathname))return respond(res,503,{error:'API_MIGRATION_PENDING'});
 if(pathname.includes('\\')||pathname.includes('\0'))return respond(res,400,{error:'BAD_PATH'});
 const segments=pathname.split('/').filter(Boolean);
 if(segments.some(x=>x.startsWith('.')||blocked.has(x))||blockedFiles.has(segments.at(-1))||segments.some(x=>/\\.(?:env|pem|key|crt|sql|bak|log)$/i.test(x)))return respond(res,404,{error:'NOT_FOUND'});
 const relative=segments.join('/')+(pathname.endsWith('/')||segments.length===0?'/index.html':'');
 const target=path.resolve(root,relative.replace(/^\//,''));
 if(target!==root&&!target.startsWith(root+path.sep))return respond(res,404,{error:'NOT_FOUND'});
 try{
  // Reject symlink escapes from the public web root before reading any bytes.
  const [canonicalRoot,canonicalTarget]=await Promise.all([realpath(root),realpath(target)]);
  if(canonicalTarget!==canonicalRoot&&!canonicalTarget.startsWith(canonicalRoot+path.sep))return respond(res,404,{error:'NOT_FOUND'});
  const info=await stat(canonicalTarget);
  if(!info.isFile())return respond(res,404,{error:'NOT_FOUND'});
  const ext=path.extname(target).toLowerCase();
  if(!types[ext])return respond(res,404,{error:'NOT_FOUND'});
  const bytes=await readFile(canonicalTarget);
  res.writeHead(200,{'Content-Type':types[ext],'Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch{return respond(res,404,{error:'NOT_FOUND'})}
}).listen(port,host,()=>console.log('GABIA_STATIC_STAGING_READY '+host+':'+port));
