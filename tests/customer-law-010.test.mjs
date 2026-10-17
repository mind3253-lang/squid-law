import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSourceDocuments} from '../lib/customer-source-ingest-audit.mjs';
const upload=readFileSync(new URL('../api/customer-large-upload.js',import.meta.url),'utf8');
test('LAW-010 upload receipts must match original hash and chunk identity',()=>{
 assert.match(upload,/doc\.sha256!==prior\.sha256/);
 assert.match(upload,/doc\.chunkUploadId!==uploadId/);
 assert.match(upload,/doc\.sourceParts!==total/);
 assert.match(upload,/existing\.size!==size/);
 assert.match(upload,/hashCustomerPdfArchive\(prefix,source\)/);
});
test('LAW-010 document audit rejects repeated source hashes',()=>{
 const doc=(id)=>({id,pageCount:2,sizeBytes:200,sha256:'a'.repeat(64)});
 assert.throws(()=>auditSourceDocuments([doc('one'),doc('two')]),/DUPLICATE_DOCUMENT_CONTENT/);
});
