export function toolAudit({jobId,key,tool,actor,ok,code}){return {jobId,key,tool,actor,ok:Boolean(ok),code:String(code||'').slice(0,80),at:new Date().toISOString()}}
