// Local-only Node HTTP adapter for existing Vercel-style API handlers.
// It intentionally does not expose any endpoint publicly or activate services.
// Routes can be opted into explicitly after reviewing authentication and storage.
import {createServer} from 'node:http';
import {Buffer} from 'node:buffer';
const host=process.env.SQUIDLAW_COMPAT_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_COMPAT_PORT||3084);
if(!['127.0.0.1','::1'].includes(host))throw Error('COMPAT_LOOPBACK_ONLY');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_COMPAT_PORT');
if(process.env.SQUIDLAW_COMPAT_PREVIEW!=='1')throw Error('COMPAT_PREVIEW_DISABLED');
// Only explicitly selected, admin-authenticated SKYNET endpoints are exposed.
// All routes remain loopback-only and require the preview flag above.
const routeModules={
 '/api/skynet-profile':'../api/skynet-profile.js',
 '/api/skynet-memory':'../api/skynet-memory.js',
 '/api/skynet-chat':'../api/skynet-chat.js',
 '/api/skynet-categories':'../api/skynet-categories.js',
 '/api/skynet-import':'../api/skynet-import.js',
 '/api/skynet-document':'../api/skynet-document.js',
 '/api/skynet-archive':'../api/skynet-archive.js',
 '/api/skynet-warehouse':'../api/skynet-warehouse.js'
};
const routes=new Map();
for(const [route,modulePath] of Object.entries(routeModules)){
 routes.set(route,async(req,res)=>{
  const {default:handler}=await import(modulePath);
  return handler(req,res);
 });
}
const maxBytes=100*1024*1024;
const streamingRoutes=new Set(['/api/skynet-archive']);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url||'/','http://localhost').pathname;
 const handler=routes.get(path);
 if(!handler){res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"NOT_FOUND"}');return;}
 const chunks=[];let size=0;
 try{
  if(streamingRoutes.has(path)){
   res.status=function(code){res.statusCode=code;return res};
   res.json=function(value){if(!res.writableEnded){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(value))}return res};
   req.query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
   await handler(req,res);
   return;
  }
  for await(const part of req){size+=part.length;if(size>maxBytes){res.writeHead(413);res.end();return;}chunks.push(part)}
  const bytes=Buffer.concat(chunks);
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  let body;
  if(contentType==='application/octet-stream')body=bytes;
  else if(bytes.length){try{body=JSON.parse(bytes.toString('utf8'))}catch{res.writeHead(400);res.end();return;}}
  const query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
  res.status=function(code){res.statusCode=code;return res};
  res.json=function(value){if(!res.writableEnded){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(value))}return res};
  req.query=query;req.body=body;
  await handler(req,res);
  if(!res.writableEnded)res.end();
 }catch(err){if(!res.headersSent)res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});if(!res.writableEnded)res.end('{"error":"SERVICE_UNAVAILABLE"}');}
});
server.listen(port,host,()=>console.log('COMPAT_LOOPBACK_PREVIEW',port));
