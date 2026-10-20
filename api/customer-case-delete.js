import {del,list} from '../lib/customer-object-storage.mjs';
import {createHash} from 'node:crypto';
import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {withLeaseDb} from './customer-analysis-lease-db.js';
const key=user=>createHash('sha256').update(user).digest('hex');
export default async function handler(req,res){
 if(req.method!=='DELETE')return respond(res,405,{error:'DELETE만 허용'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const id=String(req.query?.caseId||'');
 if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(id))return respond(res,400,{error:'사건번호 오류'});
 if(process.env.SQUIDLAW_OBJECT_BACKEND!=='gabia'&&!process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'저장소 연결 오류'});
 const registry=casePrefix(auth.user,'_index').replace('/_index/','/')+'registry/'+id+'.json';
 const prefix=casePrefix(auth.user,id);
 try{
  const record=await readJson(registry);
  if(!record||record.id!==id)return respond(res,404,{error:'사건이 없습니다'});
  // Never erase source data while an analysis writer still holds a valid lease.
  const active=await withLeaseDb(async db=>{
   const a=await db.query("SELECT 1 FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND status='running' AND lease_expires_at>now() LIMIT 1",[key(auth.user),id]);
   const b=await db.query("SELECT 1 FROM customer_analysis_leases WHERE customer_key=$1 AND case_id=$2 AND status IN ('processing','saving') AND lease_expires_at>now() LIMIT 1",[key(auth.user),id]);
   return !!(a.rows.length||b.rows.length);
  });
  if(active)return respond(res,409,{error:'현재 분석 중인 사건입니다. 분석 종료 후 전체삭제할 수 있습니다.'});
  // Block queued/retry jobs before deleting their source files.
  await withLeaseDb(async db=>{
   await db.query("DELETE FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=$2 AND NOT (status='running' AND lease_expires_at>now())",[key(auth.user),id]);
   await db.query("DELETE FROM customer_analysis_leases WHERE customer_key=$1 AND case_id=$2 AND NOT (status IN ('processing','saving') AND lease_expires_at>now())",[key(auth.user),id]);
  });
  let cursor;
  do{
   const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
   for(let i=0;i<page.blobs.length;i+=100)await del(page.blobs.slice(i,i+100).map(b=>b.url));
   cursor=page.hasMore?page.cursor:null;
  }while(cursor);
  // Delete registry last so incomplete deletion cannot appear as success.
  await del(registry);
  return respond(res,200,{deleted:true,caseId:id});
 }catch(e){
  console.error('CASE_DELETE_FAILED',String(e?.message||e));
  return respond(res,503,{error:'전체삭제가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'});
 }
}
