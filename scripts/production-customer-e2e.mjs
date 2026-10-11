import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
const origin='https://www.squidlaw.co.kr';
const id=()=>('ci'+randomBytes(8).toString('hex')).slice(0,24);
const password=()=>randomBytes(24).toString('base64url');
export function makePdf(){return readFileSync(new URL('../tests/fixtures/ci-evidence.pdf',import.meta.url))}
async function request(path,{method='GET',cookie='',body}={}){
 const headers={};if(cookie)headers.cookie=cookie;
 if(body!==undefined)headers['content-type']='application/json';
 const res=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'follow',signal:AbortSignal.timeout(25000)});
 const data=(res.headers.get('content-type')||'').includes('application/json')?await res.json():null;
 return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]||'',res};
}
if(process.env.SQUID_TEST_PDF_ONLY!=='true'){
const a={id:id(),password:password()},b={id:id(),password:password()};
async function register(u){const r=await request('/api/customer-auth',{method:'POST',body:{action:'register',...u}});assert.equal(r.status,200,'registration');assert.ok(r.cookie.startsWith('squid_session='));u.cookie=r.cookie}
await register(a);await register(b);
let r=await request('/api/customer-auth',{cookie:a.cookie});assert.equal(r.status,200);assert.equal(r.data.authenticated,true);
r=await request('/api/customer-auth',{method:'POST',body:{action:'login',id:a.id,password:'incorrect-password'}});assert.equal(r.status,401,'wrong password');
r=await request('/api/customer-cases',{method:'POST',cookie:a.cookie,body:{type:'b'}});assert.equal(r.status,201,'create case');const caseId=r.data.case.id;
r=await request('/api/customer-cases',{cookie:a.cookie});assert.equal(r.status,200);assert.ok(r.data.cases.some(x=>x.id===caseId));
r=await request('/api/customer-cases',{cookie:b.cookie});assert.equal(r.status,200);assert.ok(!r.data.cases.some(x=>x.id===caseId));
r=await request('/api/customer-case?caseId='+encodeURIComponent(caseId),{cookie:b.cookie});assert.equal(r.status,404,'cross-customer case access');
const pdf=makePdf();
r=await request('/api/customer-case?caseId='+encodeURIComponent(caseId),{method:'POST',cookie:a.cookie,body:{action:'upload',name:'integration.pdf',data:pdf.toString('base64')}});assert.equal(r.status,200,'PDF upload and parse');const docId=r.data.document.id;
r=await request('/api/customer-case?caseId='+encodeURIComponent(caseId),{cookie:a.cookie});assert.equal(r.status,200);assert.ok(r.data.documents.some(x=>x.id===docId),'PDF metadata persisted');
r=await request('/api/customer-case?caseId='+encodeURIComponent(caseId)+'&view='+encodeURIComponent(docId),{cookie:a.cookie});assert.equal(r.status,200,'PDF private readback');assert.equal(r.res.headers.get('content-type'),'application/pdf');assert.equal((await r.res.arrayBuffer()).byteLength,pdf.length);
r=await request('/api/customer-analysis-history?caseId='+encodeURIComponent(caseId),{cookie:a.cookie});assert.equal(r.status,200,'analysis history readback');
r=await request('/api/customer-analysis-history?caseId='+encodeURIComponent(caseId),{cookie:b.cookie});assert.equal(r.status,404,'analysis history isolation');
r=await request('/api/customer-auth',{method:'POST',cookie:a.cookie,body:{action:'logout'}});assert.equal(r.status,200);assert.ok(r.cookie.includes('squid_session='));
r=await request('/api/customer-auth',{cookie:r.cookie});assert.equal(r.data.authenticated,false,'logout');
r=await request('/api/customer-auth',{method:'POST',body:{action:'login',...a}});assert.equal(r.status,200,'relogin');
console.log('PASS Production customer registration, login, logout, case isolation, PDF upload/readback, history isolation. Synthetic CI-only records created.');

}
