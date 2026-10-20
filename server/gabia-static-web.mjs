// Serve the repository's existing HTML/CSS/JS without Vercel.
// Run behind nginx; no directory listing, symlinks or dotfiles.
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=await realpath(process.env.SQUIDLAW_WEB_ROOT||process.cwd());
const host=process.env.SQUIDLAW_WEB_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_WEB_PORT||3082);
if(!['127.0.0.1','::1'].includes(host)||!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_WEB_BIND');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
 const fail=(code)=>{res.writeHead(code,{'cache-control':'no-store','x-content-type-options':'nosniff'});res.end()};
 if(!['GET','HEAD'].includes(req.method))return fail(405);
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return fail(400)}
 if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p==='..'||p.startsWith('.')))return fail(403);
 if(pathname.startsWith('/api/'))return fail(404);
 const segments=pathname.split('/').filter(Boolean);
 const protectedRoots=new Set(['server','lib','deploy','worker','scripts','tests','test','node_modules','archive','docs','.github']);
 if(protectedRoots.has(segments[0])||segments[0]==='api'||segments[0]==='package.json'||segments[0]==='package-lock.json'||segments[0]==='vercel.json'||segments[0]==='README.md')return fail(403);
 if(segments.some(x=>x.startsWith('.')||x.endsWith('.map')))return fail(403);
 if(pathname.endsWith('/'))pathname+='index.html';
 const file=resolve(root,'.'+pathname);
 if(file!==root&&!file.startsWith(root+sep))return fail(403);
 try{
  const actual=await realpath(file);
  if(!actual.startsWith(root+sep))return fail(403);
  const st=await stat(actual);
  if(!st.isFile()||st.size>20*1024*1024)return fail(404);
  const type=mime[extname(actual).toLowerCase()];
  if(!type)return fail(404);
  const data=await readFile(actual);
  res.writeHead(200,{'content-type':type,'content-length':data.length,'x-content-type-options':'nosniff','cache-control':'no-cache','referrer-policy':'strict-origin-when-cross-origin'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch(e){return fail(e.code==='ENOENT'?404:500)}
}).listen(port,host,()=>console.log('SQUIDLAW_WEB_LISTEN',host,port));
