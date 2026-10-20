// Pure preflight: no network, no DB access, no customer job claims.
export function workerPreflight(env=process.env){
 const errors=[];
 if(env.SQUIDLAW_WORKER_RUN_APPROVED!=='YES')errors.push('WORKER_NOT_APPROVED');
 if(env.SQUIDLAW_WORKER_CUTOVER_APPROVED!=='YES')errors.push('WORKER_CUTOVER_NOT_APPROVED');
 if(env.SQUIDLAW_CUSTOMER_WORKER_OWNER!=='gabia')errors.push('WORKER_OWNER_NOT_GABIA');
 const backend=env.SQUIDLAW_OBJECT_BACKEND||'vercel';
 if(!['vercel','gabia'].includes(backend))errors.push('WORKER_INVALID_OBJECT_BACKEND');
 for(const key of ['CRON_SECRET'])if(!env[key]?.trim())errors.push('WORKER_MISSING_'+key);
 if(backend==='vercel'&&!env.BLOB_READ_WRITE_TOKEN?.trim())errors.push('WORKER_MISSING_BLOB_READ_WRITE_TOKEN');
 if(backend==='gabia'&&!env.SQUIDLAW_OBJECT_ROOT?.trim())errors.push('WORKER_MISSING_SQUIDLAW_OBJECT_ROOT');
 if(!(env.SQUID_CUSTOMER_DATABASE_URL||env.SQUID_CUSTOMER_DATABASE_DATABASE_URL)?.trim())errors.push('WORKER_MISSING_DATABASE_URL');
 if(env.SQUIDLAW_LEGAL_API_ENABLED==='true'&&!env.OPENAI_API_KEY?.trim())errors.push('WORKER_OPENAI_KEY_MISSING');
 return {ok:errors.length===0,errors,backend};
}
