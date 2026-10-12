export function latestEvents(job,count=30){return (job.events||[]).slice(-Math.min(200,Math.max(1,count))).map(e=>({id:e.id,type:e.type,at:e.at,details:e.details}))}
