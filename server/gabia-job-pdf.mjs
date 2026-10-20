// Bridge a claimed Gabia job to the exact immutable PDF registered in its owner case.
// No model invocation, customer-facing route, or service activation.
import {readGabiaPdf} from './gabia-immutable-pdf.mjs';
const hex64=/^[a-f0-9]{64}$/;
export async function loadGabiaJobPdf({pool,root,job}){
 if(!pool?.query||!job||!hex64.test(job.customer_key||'')||!hex64.test(job.document_version||''))throw Error('INVALID_GABIA_JOB_INPUT');
 const r=await pool.query(`SELECT d.document_id,d.page_count,d.source_sha256
 FROM gabia_documents d JOIN gabia_cases c
 ON c.customer_key=d.customer_key AND c.case_id=d.case_id
 WHERE d.customer_key=$1 AND d.case_id=$2 AND d.source_sha256=$3
 AND c.deleted_at IS NULL ORDER BY d.created_at ASC LIMIT 1`,
 [job.customer_key,job.case_id,job.document_version]);
 if(r.rowCount!==1)throw Error('GABIA_JOB_DOCUMENT_MISSING');
 const document=r.rows[0];
 const bytes=await readGabiaPdf({root,customerKey:job.customer_key,caseId:job.case_id,documentId:document.document_id,expectedSha256:document.source_sha256});
 return {bytes,documentId:document.document_id,pageCount:document.page_count,sha256:document.source_sha256};
}
