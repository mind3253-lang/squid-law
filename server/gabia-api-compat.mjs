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
 '/api/skynet-import':'../api/skynet-import.js'
};
const routes=new Map();
for(const [route,modulePath] of Object.entries(routeModules)){
 routes.set(route,async(req,res)=>{
  const {default:handler}=await import(modulePath);
  return handler(req,res);
 });
}
const maxBytes=100*1024*1024;
const server=createServer(async(req,res)=>{
 const path=new URL(req.url||'/','http://localhost').pathname;
 const handler=routes.get(path);
 if(!handler){res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"NOT_FOUND"}');return;}
 const chunks=[];let size=0;
 try{
  for await(const part of req){size+=part.length;if(size>maxBytes){res.writeHead(413);res.end();return;}chunks.push(part)}
  const raw=Buffer.concat(chunks).toString('utf8');
  let body;try{body=raw?JSON.parse(raw):undefined}catch{res.writeHead(400);res.end();return;}
  const query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
  const response={
   status(code){res.statusCode=code;return this},
   setHeader(key,value){res.setHeader(key,value);return this},
   json(value){if(res.writableEnded)return;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(value));},
   end(value){if(!res.writableEnded)res.end(value)}
  };
  await handler({method:req.method,headers:req.headers,query,body},response);
  if(!res.writableEnded)res.end();
 }catch(err){if(!res.headersSent)res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});if(!res.writableEnded)res.end('{"error":"SERVICE_UNAVAILABLE"}');}
});
server.listen(port,host,()=>console.log('COMPAT_LOOPBACK_PREVIEW',port));
