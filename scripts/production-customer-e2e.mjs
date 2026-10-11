import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const origin='https://www.squidlaw.co.kr';
const id=()=>('ci'+randomBytes(8).toString('hex')).slice(0,24);
const password=()=>randomBytes(24).toString('base64url');
function makePdf(){
 const stream='BT /F1 12 Tf 72 720 Td (SQUIDLAW TEST EVIDENCE FOR ISOLATION) Tj ET';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 '<< /Length '+Buffer.byteLength(stream)+' >>\\nstream\\n'+stream+'\\nendstream'
 ];
 let out='%PDF-1.4\\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\\n'+objects[i]+'\\nendobj\\n'}
 const start=Buffer.byteLength(out);
 out+='xref\\n0 '+(objects.length+1)+'\\n0000000000 65535 f \\n';
 for(const offset of offsets.slice(1))out+=String(offset).padStart(10,'0')+' 00000 n \\n';
 out+='trailer\\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\\nstartxref\\n'+start+'\\n%%EOF';
 return Buffer.from(out);
}
async function request(path,{method='GET',cookie='',body}={}){
 const headers={};if(cookie)headers.cookie=cookie;
 if(body!==undefined)headers['content-type']='application/json';
 const res=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'follow',signal:AbortSignal.timeout(25000)});
 const data=(res.headers.get('content-type')||'').includes('application/json')?await res.json():null;
 return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]||'',res};
}
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
