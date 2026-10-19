// Independent lightweight health server; never runs customer analysis on HTTP requests.
import {createServer} from 'node:http';
const host=process.env.SQUIDLAW_HEALTH_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_HEALTH_PORT||3081);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_HEALTH_PORT');
const server=createServer((req,res)=>{
 if(req.url!=='/healthz'||req.method!=='GET'){
  res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"NOT_FOUND"}');return;
 }
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({status:'ok',service:'squidlaw-health',analysisExecuted:false}));
});
server.requestTimeout=10000;
server.headersTimeout=5000;
server.listen(port,host,()=>console.log('HEALTH_SERVER_LISTENING',host,port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
