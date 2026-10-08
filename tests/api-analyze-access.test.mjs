import assert from 'node:assert/strict';
import handler from '../api/analyze.js';

const prior={...process.env};
const token='operator-test-token-very-long-123456';
function req(body={},headers={}){return {method:'POST',headers,body};}
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};}
async function run(request){const res=response();await handler(request,res);return res;}
try{
 delete process.env.SQUIDLAW_AI_TEST_ENABLED;
 let r=await run(req());assert.equal(r.statusCode,503);assert.equal(r.body.error,'AI_TEST_DISABLED');
 process.env.SQUIDLAW_AI_TEST_ENABLED='true';
 delete process.env.SQUIDLAW_AI_TEST_TOKEN;
 r=await run(req());assert.equal(r.statusCode,503);assert.equal(r.body.error,'TEST_TOKEN_NOT_CONFIGURED');
 process.env.SQUIDLAW_AI_TEST_TOKEN=token;
 r=await run(req());assert.equal(r.statusCode,401);assert.equal(r.body.error,'UNAUTHORIZED');
 process.env.OPENAI_API_KEY='test-key-never-sent';
 r=await run(req({consent:false,documents:[]},{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,400);assert.equal(r.body.error,'EXTERNAL_AI_CONSENT_REQUIRED');
 r=await run(req({consent:true,documents:[]},{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,422);assert.equal(r.body.error,'INVALID_DOCUMENT_COUNT');
 const large={consent:true,documents:[],padding:'가'.repeat(60000)};
 r=await run(req(large,{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,413);assert.equal(r.body.error,'REQUEST_TOO_LARGE');
 const circular={consent:true,documents:[]};circular.self=circular;
 r=await run(req(circular,{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,400);assert.equal(r.body.error,'INVALID_REQUEST_BODY');
 r=await run(req({consent:true,documents:[{name:'synthetic.pdf',pages:[{text:''}]}]},{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,422);assert.equal(r.body.error,'NO_READABLE_TEXT');
 r=await run(req({consent:true,documents:[{name:'oversized.pdf',pages:[{text:'x'.repeat(30001)}]}]},{'x-squidlaw-test-token':token}));assert.equal(r.statusCode,422);assert.equal(r.body.error,'SOURCE_PAGE_TOO_LARGE');
 r=await run({...req({consent:true,documents:[]},{'x-squidlaw-test-token':token,'content-length':'160001'})});assert.equal(r.statusCode,413);
 for(const invalidLength of ['-1','1.5','not-a-number','9007199254740992']){
  r=await run(req({consent:true,documents:[]},{'x-squidlaw-test-token':token,'content-length':invalidLength}));
  assert.equal(r.statusCode,413,'Invalid content-length should be rejected: '+invalidLength);
 }
 r=await run({method:'POST',body:{consent:true,documents:[]}});
 assert.equal(r.statusCode,401);
 const refs=Array.from({length:7},(_,i)=>'갑 제'+(i+1)+'호증').join(' ');
 const comparisonDocuments=[
  {name:'원고.pdf',pages:[{text:'원고는 '+refs+'에 기초하여 청구한다.'}]},
  {name:'피고.pdf',pages:[{text:'피고는 '+refs+'의 내용을 다투고 있다.'}]}
 ];
 r=await run(req({consent:true,documents:comparisonDocuments},{'x-squidlaw-test-token':token}));
 assert.equal(r.statusCode,422);
 assert.equal(r.body.error,'COMPARISON_BUDGET_EXCEEDED');
 const longComparison=[
  {name:'원고.pdf',pages:[{text:'원고는 갑 제1호증 '+('계약을 주장한다. '.repeat(115))}]},
  {name:'피고.pdf',pages:[{text:'피고는 갑 제1호증 '+('계약을 부인한다. '.repeat(115))}]}
 ];
 r=await run(req({consent:true,documents:longComparison},{'x-squidlaw-test-token':token}));
 assert.equal(r.statusCode,422);
 assert.match(r.body.error,/COMPARISON_(SOURCE|INPUT)/);
 const get=response();await handler({method:'GET',headers:{}},get);assert.equal(get.statusCode,405);
 console.log('PASS: AI endpoint requires operator access, explicit consent, bounded payload, and valid PDF text');
}finally{
 for(const k of ['SQUIDLAW_AI_TEST_ENABLED','SQUIDLAW_AI_TEST_TOKEN','OPENAI_API_KEY']){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
}
