import {createHash,timingSafeEqual} from 'node:crypto';
import {withLeaseDb} from './customer-analysis-lease-db.js';
const reply=(res,status,body)=>res.status(status).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(body);
function authorized(req){
 const expected=process.env.ADMIN_PASSWORD;
 if(!expected)return false;
 const header=String(req.headers.authorization||'');
 if(!header.startsWith('Basic ')||header.length>1024)return false;
 try{
  const raw=Buffer.from(header.slice(6),'base64').toString('utf8');
  const digest=s=>createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(raw),digest('admin:'+expected));
 }catch{return false}
}
export default async function handler(req,res){
 if(!authorized(req))return reply(res,401,{error:'Unauthorized'});
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 if(!(process.env.SQUID_CUSTOMER_DATABASE_URL||process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL))return reply(res,503,{ok:false,stage:'configuration'});
 try{
  const checks=await withLeaseDb(async pool=>{
   const client=await pool.connect();
   try{
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    const ping=await client.query('SELECT 1 AS healthy');
    const table=await client.query("SELECT to_regclass('public.customer_analysis_leases') IS NOT NULL AS present");
    const columns=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_analysis_leases'");
    const expected=['customer_key','case_id','request_id','request_hash','owner_token','fencing_token','status','lease_expires_at','attempt','last_completed_step','result_id','created_at','updated_at'];
    const present=new Set(columns.rows.map(x=>x.column_name));
    const schema=table.rows[0]?.present===true&&expected.every(x=>present.has(x));
    let readAccess=false;
    if(schema){await client.query('SELECT customer_key FROM public.customer_analysis_leases LIMIT 0');readAccess=true}
    await client.query('COMMIT');
    return {connection:ping.rows[0]?.healthy===1,schema,readAccess};
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  });
  const ok=checks.connection&&checks.schema&&checks.readAccess;
  return reply(res,ok?200:503,{ok,checks});
 }catch{return reply(res,503,{ok:false,stage:'database',error:'Database diagnostic failed'})}
}
