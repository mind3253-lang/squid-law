import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {withLeaseDb} from './customer-analysis-lease-db.js';
import {createHash} from 'node:crypto';
const userKey=user=>createHash('sha256').update(user).digest('hex');
export default async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'GET만 허용'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 try{
  const prefix=casePrefix(auth.user,'_index').replace('/_index/','/')+'registry/';
  const {all}=await import('./customer-case.js');
  const rows=await all(prefix,500);
  const cases=(await Promise.all(rows.filter(x=>x.pathname.endsWith('.json')).map(x=>readJson(x.pathname).catch(()=>null)))).filter(x=>x?.id&&x.id.startsWith('SL-')).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const ids=cases.map(x=>x.id);
  const jobs=ids.length?await withLeaseDb(async db=>(await db.query("SELECT DISTINCT ON (case_id) case_id,status,created_at FROM customer_analysis_jobs WHERE customer_key=$1 AND case_id=ANY($2::text[]) ORDER BY case_id,created_at DESC",[userKey(auth.user),ids])).rows):[];
  const statuses=new Map(jobs.map(j=>[j.case_id,j.status]));
  const pending=cases.filter(c=>statuses.has(c.id)&&statuses.get(c.id)!=='completed').length;
  // Sum the actual private-object sizes for this customer, including case files and reports.
  const {list}=await import('../lib/customer-object-storage.mjs');
  const storagePrefix=casePrefix(auth.user,'_index').replace('/_index/','/');
  let storageBytes=0,storageCursor;
  do{
   const page=await list({prefix:storagePrefix,limit:1000,...(storageCursor?{cursor:storageCursor}:{})});
   for(const obj of page.blobs)storageBytes+=Number(obj.size)||0;
   storageCursor=page.hasMore?page.cursor:null;
  }while(storageCursor);

  return respond(res,200,{cases:cases.map(c=>({...c,analysisStatus:statuses.get(c.id)||'not_started'})),counts:{cases:cases.length,pending,completed:cases.filter(c=>statuses.get(c.id)==='completed').length},storage:{bytes:storageBytes,mb:Number((storageBytes/1048576).toFixed(2))}});
 }catch(e){return respond(res,503,{error:'사건 현황을 불러오지 못했습니다.'})}
}
