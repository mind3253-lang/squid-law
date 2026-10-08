import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/analyze.js';

function invoke(body, headers={}) {
  return new Promise((resolve,reject)=>{
    const req={method:'POST',body,headers:{'x-squidlaw-test-token':'a'.repeat(32),...headers}};
    const res={
      headers:{},setHeader(k,v){this.headers[k]=v;return this},
      status(code){this.statusCode=code;return this},
      json(payload){resolve({status:this.statusCode,payload,headers:this.headers});return this}
    };
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

test('API rejects duplicate PDF names as input error before any model request',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const documents=[
   {name:'same.pdf',pages:[{text:'원고는 갑 제1호증의 계약기간이 5년이라고 주장한다.'}]},
   {name:'same.pdf',pages:[{text:'피고는 갑 제1호증의 계약기간이 2년이라고 주장한다.'}]}
  ];
  const result=await invoke({consent:true,documents});
  assert.equal(result.status,422);
  assert.equal(result.payload.error,'DUPLICATE_DOCUMENT_NAME');
  assert.equal(result.headers['Cache-Control'],'no-store');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API requires explicit consent and never exposes a model key',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const result=await invoke({consent:false,documents:[]});
  assert.equal(result.status,400);
  assert.equal(result.payload.error,'EXTERNAL_AI_CONSENT_REQUIRED');
  assert.ok(!JSON.stringify(result.payload).includes('unit-test-placeholder'));
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API rejects invalid document counts before paid analysis',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const result=await invoke({consent:true,documents:[]});
  assert.equal(result.status,422);
  assert.equal(result.payload.error,'INVALID_DOCUMENT_COUNT');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API refuses non-POST requests without revealing configuration',async()=>{
 const req={method:'GET',headers:{}};
 const result=await new Promise((resolve,reject)=>{
  const res={setHeader(){return this},status(code){this.code=code;return this},json(payload){resolve({status:this.code,payload});return this}};
  Promise.resolve(handler(req,res)).catch(reject);
 });
 assert.equal(result.status,405);
 assert.equal(result.payload.error,'METHOD_NOT_ALLOWED');
});

test('API rejects excessive page counts before model calls',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const documents=[{name:'long.pdf',pages:Array.from({length:31},()=>({text:'계약기간과 지급의무에 관한 원문 기록입니다.'}))}];
  const result=await invoke({consent:true,documents});
  assert.equal(result.status,422);
  assert.equal(result.payload.error,'PAGE_LIMIT_EXCEEDED');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API rejects oversized declared payloads before parsing',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const result=await invoke({consent:true,documents:[]},{'content-length':'160001'});
  assert.equal(result.status,413);
  assert.equal(result.payload.error,'REQUEST_TOO_LARGE');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API rejects wrong operator token before examining submitted PDF content',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  process.env.SQUIDLAW_AI_TEST_ENABLED='true';
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const result=await invoke({consent:true,documents:[]},{'x-squidlaw-test-token':'b'.repeat(32)});
  assert.equal(result.status,401);
  assert.equal(result.payload.error,'UNAUTHORIZED');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});

test('API remains disabled by default even when a caller supplies the operator token',async()=>{
 const saved={enabled:process.env.SQUIDLAW_AI_TEST_ENABLED,token:process.env.SQUIDLAW_AI_TEST_TOKEN,key:process.env.OPENAI_API_KEY};
 try{
  delete process.env.SQUIDLAW_AI_TEST_ENABLED;
  process.env.SQUIDLAW_AI_TEST_TOKEN='a'.repeat(32);
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  const result=await invoke({consent:true,documents:[]});
  assert.equal(result.status,503);
  assert.equal(result.payload.error,'AI_TEST_DISABLED');
 }finally{
  for(const [key,val] of Object.entries({SQUIDLAW_AI_TEST_ENABLED:saved.enabled,SQUIDLAW_AI_TEST_TOKEN:saved.token,OPENAI_API_KEY:saved.key})){
   if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
 }
});
