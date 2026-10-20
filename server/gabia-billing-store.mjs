// SQL-only billing ledger adapter. Does not connect to a payment provider.
import {createHash} from 'node:crypto';
import {validateBillingEvent} from '../lib/gabia-billing-policy.mjs';
const owner=subject=>{if(typeof subject!=='string'||!subject)throw Error('UNAUTHORIZED');return createHash('sha256').update(subject).digest('hex')};
export function createGabiaBillingStore(pool){
 if(!pool?.query)throw Error('GABIA_BILLING_DB_MISSING');
 return {
  async append({subject,event}){
   const e=validateBillingEvent(event);
   const r=await pool.query('INSERT INTO gabia_credit_ledger(customer_key,reference,kind,amount) VALUES($1,$2,$3,$4) ON CONFLICT(customer_key,reference) DO NOTHING RETURNING reference',[owner(subject),e.reference,e.kind,e.amount]);
   if(r.rowCount!==1)throw Error('DUPLICATE_BILLING_REFERENCE');
   return r.rows[0];
  },
  async entries({subject,limit=100}){
   if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_BILLING_LIMIT');
   const r=await pool.query('SELECT reference,kind,amount,created_at FROM gabia_credit_ledger WHERE customer_key=$1 ORDER BY created_at DESC,reference DESC LIMIT $2',[owner(subject),limit]);
   return r.rows;
  }
 };
}
