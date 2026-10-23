import {createHash,randomUUID} from 'node:crypto';
const redact=s=>String(s??'').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|[?&](?:token|key|secret|password)=[^&\s]+/ig,'[REDACTED]').slice(0,300);
const loc=e=>String(e?.stack||'').split('\n').map(x=>x.match(/(?:api|lib|admin)\/[A-Za-z0-9._/-]+:\d+:\d+/)?.[0]).find(Boolean)||null;
export function captureServerError(error,{system='SQUIDLAW',operation='unknown',stage='',jobId=null}={}){
 const e=error instanceof Error?error:new Error(String(error));
 const traceId='ERR-'+randomUUID();
 const code=/^[A-Z][A-Z0-9_]{2,100}$/.test(String(e.message||''))?e.message:/^[A-Z][A-Z0-9_]{2,100}$/.test(String(e.code||''))?e.code:'SERVER_ERROR';
 const record={traceId,time:new Date().toISOString(),system,operation,stage,jobId:jobId?createHash('sha256').update(String(jobId)).digest('hex').slice(0,16):null,code,name:e.name||'Error',message:redact(e.message),source:loc(e)};
 console.error('CENTRAL_ERROR_DIAGNOSTIC',JSON.stringify(record));
 return {traceId,code,record};
}
