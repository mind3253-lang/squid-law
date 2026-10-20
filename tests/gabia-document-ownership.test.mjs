import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGabiaOwnedDocument,gabiaOwnedDocumentSql} from '../server/gabia-document-ownership.mjs';
test('only registered documents in active owner cases qualify',async()=>{
 const seen=[];
 const pool={query:async(sql,args)=>{seen.push(args);return {rowCount:1}}};
 await assertGabiaOwnedDocument(pool,{customerKey:'a'.repeat(64),caseId:'11111111-1111-4111-8111-111111111111',sha256:'b'.repeat(64)});
 assert.equal(seen[0][0],'a'.repeat(64));
 assert.match(gabiaOwnedDocumentSql,/deleted_at IS NULL/);
});
test('unregistered PDF blocks analysis',async()=>{
 const pool={query:async()=>({rowCount:0})};
 await assert.rejects(()=>assertGabiaOwnedDocument(pool,{customerKey:'a'.repeat(64),caseId:'11111111-1111-4111-8111-111111111111',sha256:'b'.repeat(64)}),/DOCUMENT_NOT_REGISTERED/);
});
