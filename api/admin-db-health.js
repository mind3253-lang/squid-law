import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {withLeaseDb} from './customer-analysis-lease-db.js';
const reply=(res,status,body)=>res.status(status).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(body);
const githubKeys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
async function authorized(req){
 const expected=process.env.ADMIN_PASSWORD;
 const header=String(req.headers.authorization||'');
 if(header.startsWith('Bearer ')&&header.length<8192){
  try{
   const {payload}=await jwtVerify(header.slice(7),githubKeys,{issuer:'https://token.actions.githubusercontent.com',audience:'squidlaw-production-health',algorithms:['RS256']});
   return payload.repository==='mind3253-lang/squid-law'&&payload.repository_owner==='mind3253-lang'&&payload.ref==='refs/heads/main'&&typeof payload.sub==='string'&&payload.sub.startsWith('repo:mind3253-lang@')&&payload.sub.includes('/squid-law@')&&payload.sub.endsWith(':ref:refs/heads/main')&&payload.workflow_ref==='mind3253-lang/squid-law/.github/workflows/production-db-health.yml@refs/heads/main'&&['push','workflow_dispatch'].includes(payload.event_name);
  }catch{return false}
 }
 if(!expected||!header.startsWith('Basic ')||header.length>1024)return false;
 try{
  const raw=Buffer.from(header.slice(6),'base64').toString('utf8');
  const digest=s=>createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(raw),digest('admin:'+expected));
 }catch{return false}
}
export default async function handler(req,res){
 if(!await authorized(req))return reply(res,401,{error:'Unauthorized'});
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
    const constraints=await client.query("SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.customer_analysis_leases'::regclass").catch(()=>({rows:[]}));
    const primaryKey=constraints.rows.some(x=>x.contype==='p'&&/customer_key/.test(x.definition)&&/case_id/.test(x.definition)&&/request_id/.test(x.definition));
    const statusConstraint=constraints.rows.some(x=>x.contype==='c'&&/status/.test(x.definition)&&/recovery_required/.test(x.definition));
    let readAccess=false;
    if(schema){await client.query('SELECT customer_key FROM public.customer_analysis_leases LIMIT 0');readAccess=true}
    await client.query('COMMIT');
    let writeAccess=false;
    if(schema&&primaryKey&&statusConstraint){
     try{
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '3000ms'");
      const id=randomUUID(),key='squidlaw-health-'+randomUUID();
      await client.query("INSERT INTO public.customer_analysis_leases(customer_key,case_id,request_id,request_hash) VALUES($1,$2,$3,$4)",[key,'SL-healthcheck',id,'0'.repeat(64)]);
      const check=await client.query('SELECT request_id FROM public.customer_analysis_leases WHERE customer_key=$1 AND case_id=$2 AND request_id=$3',[key,'SL-healthcheck',id]);
      writeAccess=check.rowCount===1;
     }finally{await client.query('ROLLBACK').catch(()=>{})}
    }
    return {connection:ping.rows[0]?.healthy===1,schema,primaryKey,statusConstraint,readAccess,writeAccess};
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
  });
  const ok=Object.values(checks).every(Boolean);
  return reply(res,ok?200:503,{ok,checks});
 }catch{return reply(res,503,{ok:false,stage:'database',error:'Database diagnostic failed'})}
}
