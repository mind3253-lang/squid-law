import {skynetOwnerKey} from '../lib/skynet-memory-policy.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createGabiaCaseStore(pool){
 if(!pool?.query)throw Error('GABIA_DB_NOT_CONFIGURED');
 return {
  async list(subject){
   const result=await pool.query('SELECT case_id,title,created_at FROM gabia_cases WHERE customer_key=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',[skynetOwnerKey(subject)]);
   return result.rows;
  },
  async documents({subject,caseId}){
   if(!uuid.test(caseId||''))throw Error('INVALID_CASE_REQUEST');
   const r=await pool.query('SELECT d.document_id,d.source_sha256,d.page_count,d.created_at FROM gabia_documents d JOIN gabia_cases c ON c.customer_key=d.customer_key AND c.case_id=d.case_id WHERE d.customer_key=$1 AND d.case_id=$2 AND c.deleted_at IS NULL ORDER BY d.created_at DESC',[skynetOwnerKey(subject),caseId]);
   return r.rows;
  },
  async remove({subject,caseId}){
   if(!uuid.test(caseId||''))throw Error('INVALID_CASE_REQUEST');
   const r=await pool.query('UPDATE gabia_cases SET deleted_at=now() WHERE customer_key=$1 AND case_id=$2 AND deleted_at IS NULL RETURNING case_id',[skynetOwnerKey(subject),caseId]);
   return r.rowCount===1;
  }
 };
}
