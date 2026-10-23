import test from 'node:test';
import assert from 'node:assert/strict';
import {captureServerError} from '../lib/server-error-diagnostics.mjs';

test('server diagnostics emit stable trace IDs and redact sensitive messages',async()=>{
 const previous=process.env.SQUID_CUSTOMER_DATABASE_URL;
 const legacy=process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL;
 delete process.env.SQUID_CUSTOMER_DATABASE_URL;
 delete process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL;
 const old=console.error;console.error=()=>{};
 try{
  const {traceId,code,record}=captureServerError(new Error('Bearer secret-token https://example.org/private?token=abc test@example.com'),{jobId:'private-job-id',operation:'test'});
  assert.match(traceId,/^ERR-[0-9a-f-]{36}$/);
  assert.equal(code,'SERVER_ERROR');
  assert.equal(record.traceId,traceId);
  assert.equal(record.jobId.length,16);
  assert.doesNotMatch(JSON.stringify(record),/secret-token|example.org|test@example.com|private-job-id/);
  assert.deepEqual(await record.persistence,{stored:false,traceId,reason:'DATABASE_NOT_CONFIGURED'});
  const coded=captureServerError(Object.assign(new Error('INTERNAL_FAILURE'),{code:'UNSAFE_CODE'}));
  assert.equal(coded.code,'INTERNAL_FAILURE');
  await coded.record.persistence;
 }finally{console.error=old;if(previous===undefined)delete process.env.SQUID_CUSTOMER_DATABASE_URL;else process.env.SQUID_CUSTOMER_DATABASE_URL=previous;if(legacy===undefined)delete process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL;else process.env.SQUID_CUSTOMER_DATABASE_DATABASE_URL=legacy}
});
