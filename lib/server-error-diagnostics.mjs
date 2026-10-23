import {createHash,randomUUID} from 'node:crypto';
const redact=s=>String(s??'').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|[?&](?:token|key|secret|password)=[^&\s]+/ig,'[REDACTED]').slice(0,300);
const loc=e=>String(e?.stack||'').split('\n').map(x=>x.match(/(?:api|lib|admin)\/[A-Za-z0-9._/-]+:\d+:\d+/)?.[0]).find(Boolean)||null;
export function captureServerError(error,{system='SQUIDLAW',operation='unknown',stage='',jobId=null}={}){
 const e=error instanceof Error?error:new Error(String(error));
 const traceId='ERR-'+randomUUID();
 const code=/^[A-Z][A-Z0-9_]{2,100}$/.test(String(e.message||''))?e.message:/^[A-Z][A-Z0-9_]{2,100}$/.test(String(e.code||''))?e.code:'SERVER_ERROR';
 const record={traceId,time:new Date().toISOString(),system,operation,stage,jobId:jobId?createHash('sha256').update(String(jobId)).digest('hex').slice(0,16):null,code,name:e.name||'Error',message:redact(e.message),source:loc(e)};
 console.error('CENTRAL_ERROR_DIAGNOSTIC',JSON.stringify(record));
 // Best-effort durable storage: never let diagnostics break the primary request.
 if(process.env.SQUID_CUSTOMER_DATABASE_URL||process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL){
  const persistence=import('../api/customer-analysis-lease-db.js').then(({withLeaseDb})=>
   withLeaseDb(async db=>{
    await db.query(`CREATE TABLE IF NOT EXISTS squid_error_diagnostics(
     trace_id TEXT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     system TEXT NOT NULL,operation TEXT NOT NULL,stage TEXT,code TEXT NOT NULL,
     error_name TEXT,message TEXT,source TEXT,job_hash TEXT)`);
    await db.query(`INSERT INTO squid_error_diagnostics
     (trace_id,system,operation,stage,code,error_name,message,source,job_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
      record.traceId,record.system,record.operation,record.stage,record.code,
      record.name,record.message,record.source,record.jobId
     ]);
   })
  ).catch(err=>console.error('DIAGNOSTIC_STORAGE_FAILURE',String(err?.code||err?.name||'UNKNOWN').slice(0,60)));
  Object.defineProperty(record,'persistence',{value:persistence,enumerable:false});
 }
 return {traceId,code,record};
}
