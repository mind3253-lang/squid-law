import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {customerPdfChunkPaths} from '../lib/customer-pdf-source.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('private customer upload supports 500MB+ via bounded fragments without whole-Buffer reassembly',()=>{
 const chunk=1024*1024,total=500,size=500*chunk;
 const parts=customerPdfChunkPaths('case/', '12345678-1234-4234-a234-123456789012',total,chunk,size);
 assert.equal(parts.length,500);
 assert.equal(parts[0].pathname,'case/chunks/12345678-1234-4234-a234-123456789012/0.part');
 assert.equal(parts.at(-1).size,chunk);
 const endpoint=read('api/customer-large-upload.js');
 assert.match(endpoint,/hashCustomerPdfArchive\(prefix,source\)/);
 assert.match(endpoint,/extractPdfPagesByRange\(range/);
 assert.match(endpoint,/sourceKind:'private_chunked_pdf_v1'/);
 assert.doesNotMatch(endpoint,/const MAX=100\*/);
 assert.doesNotMatch(endpoint,/Buffer\.concat\(buffers\)/);
 assert.match(endpoint,/allowOverwrite:false/);
 assert.match(endpoint,/upload-receipts/);
 const client=read('customer.html');
 assert.doesNotMatch(client,/PDF는 현재 100MB 이하여야 합니다/);
 assert.match(client,/const result=await uploadLarge\(f\)/);
 assert.match(client,/sessionStorage\.setItem\(key/);
});

test('legal worker reads source PDF ranges for text, OCR and independent visual windows',()=>{
 const worker=read('api/customer-analysis-worker.js');
 assert.match(worker,/extractCustomerPdfWindow\(prefix,d/);
 assert.match(worker,/splitRangeVisualWindows\(/);
 assert.match(worker,/splitRangeVisualPageSet\(/);
 assert.match(worker,/createCustomerPdfRangeSource\(prefix,doc\)/);
 const view=read('api/customer-case.js');
 assert.match(view,/customerPdfChunkPaths/);
 assert.match(view,/for\(const part of parts\)/);
});

test('customer comparison tables and legal findings have semantic table structure',()=>{
 const html=read('customer.html');
 assert.match(html,/renderCaseMarkdown\(e,text\)/);
 assert.match(html,/className='case-markdown-table'/);
 assert.match(html,/th\.scope='col'/);
 assert.match(html,/for\(const finding of report\.findings\)/);
 const start=html.indexOf('function caseTableCells('),end=html.indexOf('function bubble(',start);
 assert.ok(start>=0&&end>start);
 class Node{constructor(name){this.tagName=name;this.children=[];this.textContent='';this.className=''}
  append(v){this.children.push(v)}}
 const render=new Function('document',html.slice(start,end)+'return renderCaseMarkdown;')({
  createElement:name=>new Node(name)
 });
 const result=new Node('root');
 render(result,'## 주장 비교\n| 쟁점 | 원고 | 피고 |\n|---|---|---|\n| 임대료 | 상계 | 미납 |\n| 증거 | <img src=x> | 없음 |');
 const table=result.children.find(x=>x.className==='case-table-wrap')?.children[0];
 assert.equal(table?.tagName,'table');
 assert.equal(table.children[1].children.length,2);
 assert.equal(table.children[1].children[1].children[1].textContent,'<img src=x>');
 assert.equal(table.children[1].children[1].children[1].children.length,0);
});
