import {list} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {readIndex} from './skynet-search-index.js';
import {searchDbEnabled,indexSearchExcerpts,
 claimSearchBackfill,advanceSearchBackfill,abandonSearchBackfill
} from '../lib/skynet-search-db.mjs';

const respond=(res,status,value)=>res.status(status)
 .setHeader('Cache-Control','private, no-store').setHeader('Vary','Authorization').json(value);
function authorized(req){
 const h=String(req.headers.authorization||'');
 if(process.env.CRON_SECRET&&h==='Bearer '+process.env.CRON_SECRET)return true;
 try{
  return !!process.env.ADMIN_PASSWORD&&h.startsWith('Basic ')&&
   Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD;
 }catch{return false}
}
export default async function handler(req,res){
 if(!authorized(req))return respond(res,401,{error:'AUTH_REQUIRED'});
 if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'GET_OR_POST_ONLY'});
 if(!searchDbEnabled())return respond(res,503,{error:'SEARCH_SQL_NOT_CONFIGURED'});
 const owner=randomUUID().replace(/-/g,'');
 let claimed=false;
 try{
  const lease=await claimSearchBackfill(owner);
  if(!lease.claimed)return respond(res,200,{ok:true,backfill:
   lease.complete?'complete':lease.busy?'busy':'not_ready',
   processed:lease.processed||0});
  claimed=true;
  const page=await list({prefix:'skynet/search-index/',limit:24,
   ...(lease.cursor?{cursor:lease.cursor}:{})});
  let indexed=0;
  for(let i=0;i<page.blobs.length;i+=4){
   const batch=page.blobs.slice(i,i+4);
   const results=await Promise.allSettled(batch.map(async item=>{
    if(!String(item.pathname||'').endsWith('.json'))return 0;
    const index=await readIndex(item.pathname);
    if(!index||!Array.isArray(index.entries))throw Error('SEARCH_INDEX_MISSING_'+item.pathname);
    if(!index.entries.length)return 0; // shard manifest
    await indexSearchExcerpts(index.source,index.entries,{complete:false});
    return index.entries.length;
   }));
   const failed=results.filter(x=>x.status==='rejected');
   if(failed.length)throw failed[0].reason;
   indexed+=results.reduce((n,x)=>n+(x.status==='fulfilled'?x.value:0),0);
  }
  const total=await advanceSearchBackfill(owner,{
   cursor:page.hasMore?page.cursor:null,
   processed:page.blobs.length,complete:!page.hasMore
  });
  claimed=false;
  return respond(res,200,{ok:true,backfill:total.complete?'complete':'running',
   indexedEntries:indexed,batchFiles:page.blobs.length,
   processedFiles:total.processed,complete:total.complete});
 }catch(e){
  console.error('SKYNET_SQL_SEARCH_BACKFILL_FAILED',String(e?.message||e).slice(0,150));
  if(claimed)try{await abandonSearchBackfill(owner)}catch{}
  return respond(res,503,{error:'BACKFILL_DEFERRED',retryable:true});
 }
}
