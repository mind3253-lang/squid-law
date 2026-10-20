// Local-only Node HTTP adapter for existing Vercel-style API handlers.
// It intentionally does not expose any endpoint publicly or activate services.
// Routes can be opted into explicitly after reviewing authentication and storage.
import {createServer} from 'node:http';
import {Buffer} from 'node:buffer';
const host=process.env.SQUIDLAW_COMPAT_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_COMPAT_PORT||3084);
if(!['127.0.0.1','::1'].includes(host))throw Error('COMPAT_LOOPBACK_ONLY');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_COMPAT_PORT');
if(process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia')throw Error('GABIA_STORAGE_REQUIRED');
// Only explicitly selected routes are exposed on loopback; individual handlers enforce authorization.
const routeModules={
 '/api/skynet-profile':'../api/skynet-profile.js',
 '/api/skynet-memory':'../api/skynet-memory.js',
 '/api/skynet-chat':'../api/skynet-chat.js',
 '/api/skynet-categories':'../api/skynet-categories.js',
 '/api/skynet-import':'../api/skynet-import.js',
 '/api/skynet-document':'../api/skynet-document.js',
 '/api/skynet-archive':'../api/skynet-archive.js',
 '/api/skynet-warehouse':'../api/skynet-warehouse.js',
 '/api/customer-auth':'../api/customer-auth.js',
 '/api/customer-case':'../api/customer-case.js',
 '/api/customer-cases':'../api/customer-cases.js',
 '/api/customer-members':'../api/customer-members.js',
 '/api/customer-case-delete':'../api/customer-case-delete.js',
 '/api/customer-case-knowledge':'../api/customer-case-knowledge.js',
 '/api/customer-large-upload':'../api/customer-large-upload.js',
 '/api/customer-legal-report':'../api/customer-legal-report.js',
 '/api/customer-request-state':'../api/customer-request-state.js',
 '/api/customer-review-batch':'../api/customer-review-batch.js',
 '/api/customer-text-review-report':'../api/customer-text-review-report.js',
 '/api/customer-analysis':'../api/customer-analysis.js',
 '/api/customer-analysis-history':'../api/customer-analysis-history.js',
 '/api/customer-analysis-job':'../api/customer-analysis-job.js',
 '/api/customer-analysis-status':'../api/customer-analysis-status.js',
 '/api/auth/naver/start':'../api/auth/naver/start.js',
 '/api/auth/naver/callback':'../api/auth/naver/callback.js',
 '/api/skynet-document-context':'../api/skynet-document-context.js',
 '/api/skynet-document-fulltext':'../api/skynet-document-fulltext.js',
 '/api/skynet-document-job':'../api/skynet-document-job.js',
 '/api/skynet-document-page-context':'../api/skynet-document-page-context.js',
 '/api/skynet-document-range':'../api/skynet-document-range.js',
 '/api/skynet-document-review':'../api/skynet-document-review.js',
 '/api/skynet-document-verify':'../api/skynet-document-verify.js',
 '/api/skynet-category-dashboard':'../api/skynet-category-dashboard.js',
 '/api/skynet-timeline':'../api/skynet-timeline.js',
 '/api/skynet-plan':'../api/skynet-plan.js',
 '/api/skynet-jobs':'../api/skynet-jobs.js',
 '/api/skynet-long-turn':'../api/skynet-long-turn.js',
 '/api/skynet-plan-job':'../api/skynet-plan-job.js',
 '/api/skynet-code-task':'../api/skynet-code-task.js',
 '/api/skynet-tool-run':'../api/skynet-tool-run.js',
 '/api/customer-mypage-summary':'../api/customer-mypage-summary.js'
};
// Explicit SKYNET routes are resolved locally, without Vercel routing.
const routes=new Map();
for(const [route,modulePath] of Object.entries(routeModules)){
 routes.set(route,async(req,res)=>{
  const {default:handler}=await import(modulePath);
  return handler(req,res);
 });
}
const maxBytes=100*1024*1024;
const smallRequestBytes=2*1024*1024;
const streamingRoutes=new Set(['/api/skynet-archive']);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url||'/','http://localhost').pathname;
 const handler=routes.get(path);
 if(!handler){res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"NOT_FOUND"}');return;}
 const chunks=[];let size=0;
 try{
  if(streamingRoutes.has(path)){
   res.status=function(code){res.statusCode=code;return res};
   res.send=function(value){if(!res.writableEnded)res.end(value);return res};
   res.redirect=function(code,url){if(url===undefined){url=code;code=302}res.statusCode=code;res.setHeader('Location',url);res.end();return res};
   res.json=function(value){if(!res.writableEnded){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(value))}return res};
   req.query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
   await handler(req,res);
   return;
  }
  for await(const part of req){size+=part.length;if(size>(path==='/api/customer-large-upload'||path==='/api/skynet-document'?maxBytes:smallRequestBytes)){res.writeHead(413);res.end();return;}chunks.push(part)}
  const bytes=Buffer.concat(chunks);
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  let body;
  if(contentType==='application/octet-stream')body=bytes;
  else if(bytes.length){try{body=JSON.parse(bytes.toString('utf8'))}catch{res.writeHead(400);res.end();return;}}
  const query=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
  res.status=function(code){res.statusCode=code;return res};
  res.send=function(value){if(!res.writableEnded)res.end(value);return res};
  res.redirect=function(code,url){if(url===undefined){url=code;code=302}res.statusCode=code;res.setHeader('Location',url);res.end();return res};
  res.json=function(value){if(!res.writableEnded){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(value))}return res};
  req.query=query;req.body=body;
  await handler(req,res);
  if(!res.writableEnded)res.end();
 }catch(err){if(!res.headersSent)res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});if(!res.writableEnded)res.end('{"error":"SERVICE_UNAVAILABLE"}');}
});
server.listen(port,host,()=>console.log('GABIA_API_LISTEN',port));
