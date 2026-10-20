// Explicitly configured Gabia database only. Never fall back to the Vercel URL.
import {createHash,randomUUID} from 'node:crypto';
const digest=user=>createHash('sha256').update(user).digest('hex');
export function createGabiaJobStore(pool){
 if(!pool||typeof pool.query!=='function')throw Error('GABIA_DB_NOT_CONFIGURED');
 return {
  async enqueue({subject,caseId,documentVersion}){
   if(typeof subject!=='string'||!subject||!/^[-0-9a-f]{36}$/.test(caseId||'')||!/^[a-f0-9]{64}$/.test(documentVersion||''))throw Error('INVALID_JOB_REQUEST');
   const customerKey=digest(subject),jobId=randomUUID();
   const ownership=await pool.query('SELECT 1 FROM gabia_documents d JOIN gabia_cases c ON c.customer_key=d.customer_key AND c.case_id=d.case_id WHERE d.customer_key=$1 AND d.case_id=$2 AND d.source_sha256=$3 AND c.deleted_at IS NULL LIMIT 1',[customerKey,caseId,documentVersion]);
   if(ownership.rowCount!==1)throw Error('DOCUMENT_NOT_REGISTERED');
   const r=await pool.query('INSERT INTO gabia_customer_jobs(customer_key,case_id,job_id,document_version) VALUES($1,$2,$3,$4) RETURNING job_id,case_id,status,stage,created_at',
    [customerKey,caseId,jobId,documentVersion]);
   return r.rows[0];
  },
  async status({subject,caseId,jobId}){
   if(typeof subject!=='string'||!subject||!/^[-0-9a-f]{36}$/.test(caseId||'')||!/^[-0-9a-f]{36}$/.test(jobId||''))throw Error('INVALID_JOB_REQUEST');
   const r=await pool.query('SELECT job_id,case_id,status,stage,error_code,created_at,updated_at FROM gabia_customer_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3',
    [digest(subject),caseId,jobId]);
   return r.rows[0]||null;
  },
  async result({subject,caseId,jobId}){
   if(typeof subject!=='string'||!subject||!/^[-0-9a-f]{36}$/.test(caseId||'')||!/^[-0-9a-f]{36}$/.test(jobId||''))throw Error('INVALID_JOB_REQUEST');
   const r=await pool.query("SELECT status,result_path FROM gabia_customer_jobs WHERE customer_key=$1 AND case_id=$2 AND job_id=$3",
    [digest(subject),caseId,jobId]);
   return r.rows[0]||null;
  }
 };
}
