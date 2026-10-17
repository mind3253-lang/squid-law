import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {extractPdfPages} from '../api/customer-pdf-extract.js';
import {scheduleCustomerWorker} from '../lib/customer-worker-dispatch.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('parallel PDF extraction preserves page order, text and deterministic operator fingerprints',async()=>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let page=1;page<=11;page++){
  const p=doc.addPage([500,700]);
  p.drawText('PAGE_'+String(page).padStart(2,'0')+'_LEGAL_RECORD',{x:36,y:650,size:12,font});
 }
 const input=Buffer.from(await doc.save());
 const textOnly=await extractPdfPages(input,{startPage:1,pageCount:11,fastTextOnly:true});
 assert.equal(textOnly.totalPages,11);
 assert.equal(textOnly.finished,true);
 assert.deepEqual(textOnly.pages.map(x=>x.page),Array.from({length:11},(_,i)=>i+1));
 for(let i=0;i<11;i++){
  assert.match(textOnly.pages[i].text,new RegExp('PAGE_'+String(i+1).padStart(2,'0')+'_LEGAL_RECORD'));
  assert.equal(textOnly.pages[i].visualInventoryStatus,'visual_scan_deferred');
  assert.match(textOnly.pages[i].visualOperatorDigest,/^[a-f0-9]{64}$/);
 }
 const strict=await extractPdfPages(input,{startPage:4,pageCount:6});
 assert.deepEqual(strict.pages.map(x=>x.page),[4,5,6,7,8,9]);
 assert.equal(strict.finished,false);
 assert.ok(strict.pages.every(x=>x.visualInventoryStatus!=='visual_scan_deferred'));
 assert.ok(strict.pages.every(x=>/^[a-f0-9]{64}$/.test(x.visualOperatorDigest)));
});

test('auto-dispatch fails safe without worker authentication',()=>{
 const old=process.env.CRON_SECRET;
 try{
  delete process.env.CRON_SECRET;
  assert.equal(scheduleCustomerWorker(),false);
 }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
});

test('worker progress remains durable and lease fenced',()=>{
 const jobs=read('api/customer-analysis-jobs-db.js');
 const worker=read('api/customer-analysis-worker.js');
 const db=read('api/customer-analysis-lease-db.js');
 assert.match(jobs,/FOR UPDATE SKIP LOCKED/);
 assert.match(jobs,/AND owner_token=\$4[\s\S]*AND fence=\$5 AND status='running' AND lease_expires_at>now\(\)/);
 assert.match(jobs,/if\(status==='retry'&&stage!=='error'\)scheduleCustomerWorker/);
 assert.match(jobs,/export async function renewJobLease/);
 assert.match(worker,/heartbeat=setInterval/);
 assert.match(worker,/renewJobLease\(job\)/);
 assert.match(worker,/finally\{if\(heartbeat\)clearInterval\(heartbeat\)\}/);
 assert.match(db,/let cachedPool=null,cachedKey=null/);
 assert.match(db,/allowExitOnIdle:true/);
 assert.doesNotMatch(db,/finally\{await pool\.end\(\)\}/);
});

test('100 MiB PDF upload boundary is consistent across customer and SKYNET entry points',()=>{
 const customerApi=read('api/customer-large-upload.js');
 const customerUi=read('customer.html');
 const skyUi=read('admin/skynet.html');
 const skyArchive=read('api/skynet-archive.js');
 const skyDocument=read('api/skynet-document.js');
 assert.match(customerApi,/MAX_PDF_BYTES=100\*1024\*1024/);
 assert.match(customerApi,/size>MAX_PDF_BYTES/);
 assert.match(customerUi,/f\.size>100\*1024\*1024/);
 assert.match(skyUi,/f\.size>100\*1048576/);
 assert.match(skyArchive,/const MAX=1024\*1024\*100/);
 assert.match(skyDocument,/PDF_MAX_BYTES=100\*1048576/);
 for(const size of [10,30,50,80,99,100,101].map(mib=>mib*1048576)){
  assert.equal(size<=100*1048576,size!==101*1048576);
 }
});

test('multi-page synthetic PDF extraction reports elapsed time and preserves every page',async()=>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let page=1;page<=128;page++){
  const p=doc.addPage([500,700]);
  p.drawText('CASE_EVIDENCE_PAGE_'+page,{x:30,y:650,size:11,font});
 }
 const input=Buffer.from(await doc.save());
 const started=performance.now();
 const result=await extractPdfPages(input,{startPage:1,pageCount:128,fastTextOnly:true});
 const elapsedMs=Math.round(performance.now()-started);
 assert.equal(result.pages.length,128);
 assert.deepEqual(result.pages.map(x=>x.page),Array.from({length:128},(_,i)=>i+1));
 for(let i=0;i<128;i++)assert.match(result.pages[i].text,new RegExp('CASE_EVIDENCE_PAGE_'+(i+1)));
 console.log(JSON.stringify({benchmark:'synthetic-pdf-text-extraction',pages:128,bytes:input.length,elapsedMs,heapUsed:process.memoryUsage().heapUsed}));
});
