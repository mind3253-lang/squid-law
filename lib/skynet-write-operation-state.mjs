export function markWriteUncertain(job,key,reason='OUTCOME_UNKNOWN'){const op=job.operations?.[key];if(!op||op.status!=='pending')throw Error('OPERATION_NOT_PENDING');return {...job,operations:{...job.operations,[key]:{...op,status:'uncertain',reason,uncertainAt:new Date().toISOString()}}}}
export function writeOperationComplete(job,key){return job.operations?.[key]?.status==='completed'}
