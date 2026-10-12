export function safeEvent(jobId,type,code){if(!jobId||!type)throw Error('INVALID_EVENT');return {jobId,type,code:String(code||'').slice(0,80),at:new Date().toISOString()}}
