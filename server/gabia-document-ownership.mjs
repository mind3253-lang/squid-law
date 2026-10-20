// A job may start only when its PDF is registered to the same customer and active case.
export const gabiaOwnedDocumentSql=`SELECT 1 FROM gabia_documents d
 JOIN gabia_cases c ON c.customer_key=d.customer_key AND c.case_id=d.case_id
 WHERE d.customer_key=$1 AND d.case_id=$2 AND d.source_sha256=$3
 AND c.deleted_at IS NULL LIMIT 1`;
export async function assertGabiaOwnedDocument(pool,{customerKey,caseId,sha256}){
 if(!pool?.query||!customerKey||!caseId||!/^[a-f0-9]{64}$/.test(sha256||''))throw Error('INVALID_DOCUMENT_OWNERSHIP_REQUEST');
 const result=await pool.query(gabiaOwnedDocumentSql,[customerKey,caseId,sha256]);
 if(result.rowCount!==1)throw Error('DOCUMENT_NOT_REGISTERED');
 return true;
}
