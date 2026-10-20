import {skynetOwnerKey} from '../lib/skynet-memory-policy.mjs';
export function createGabiaCaseStore(pool){
 if(!pool?.query)throw Error('GABIA_DB_NOT_CONFIGURED');
 return {
  async list(subject){
   const result=await pool.query('SELECT case_id,title,created_at FROM gabia_cases WHERE customer_key=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',[skynetOwnerKey(subject)]);
   return result.rows;
  }
 };
}
