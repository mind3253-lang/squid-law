#!/usr/bin/env node
// Gabia phase-one staging gateway. Only explicitly migrated handlers are enabled.
// This is not a production cutover and must remain bound to loopback.
import http from 'node:http';
const host='127.0.0.1';
const port=Number(process.env.SQUIDLAW_STAGING_API_PORT||3081);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
const routes=new Map();
function reply(res,status,payload){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(payload));
}
http.createServer(async(req,res)=>{
 let pathname;
 try{pathname=new URL(req.url||'/', 'http://localhost').pathname}catch{return reply(res,400,{error:'BAD_URL'})}
 if(req.method==='GET'&&pathname==='/__health')return reply(res,200,{status:'ok',mode:'staging',migratedRoutes:routes.size});
 const key=req.method+' '+pathname;
 const handler=routes.get(key);
 if(!handler)return reply(res,503,{error:'API_MIGRATION_PENDING',path:pathname});
 try{await handler(req,res)}catch(e){
  console.error('GABIA_STAGING_API_ERROR',String(e?.name||'ERROR'));
  if(!res.headersSent)reply(res,500,{error:'INTERNAL_ERROR'});else res.end();
 }
}).listen(port,host,()=>console.log('GABIA_STAGING_API_READY',port));
