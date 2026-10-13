import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seekIndexedPage,readIndexedPageWindow} from '../lib/skynet-indexed-page-read.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('select 143..258 from a 258-page PDF even when early pages occupy most segments',async()=>{
 const segments=[];
 for(let page=1;page<=258;page++){
  // A long early page gets many segments; segment midpoint need not match page midpoint.
  const count=page<=40?9:1;
  for(let i=0;i<count;i++)segments.push({
   page,part:i+1,text:'evidence page '+page+' part '+(i+1)+'\n'+'.'.repeat(page<=40?300:30)
  });
 }
 const readSegment=async index=>segments[index];
 assert.ok(segments[Math.floor(segments.length/2)].page<143);
 const start=await seekIndexedPage({segmentCount:segments.length,readSegment,page:143});
 assert.equal(segments[start].page,143);
 const pages=new Set();let offset=null,position=0,done=false,calls=0;
 while(!done&&calls++<1000){
  const out=await readIndexedPageWindow({segmentCount:segments.length,readSegment,
   startPage:143,endPage:258,offset,position,limit:700});
  for(const page of out.pages){assert.ok(page>=143&&page<=258);pages.add(page)}
  if(out.done)done=true;
  else{
   assert.ok(offset===null||out.offset>offset||
    (out.offset===offset&&out.position>position),'cursor must advance');
   offset=out.offset;position=out.position;
  }
 }
 assert.ok(done);
 assert.equal(pages.size,116);
 assert.equal(Math.min(...pages),143);
 assert.equal(Math.max(...pages),258);
});

test('page-range reading rejects missing, invalid and out-of-order segment data',async()=>{
 const segments=[{page:143,text:'A',part:1},{page:145,text:'B',part:1}];
 const a=await readIndexedPageWindow({segmentCount:segments.length,
  readSegment:async i=>segments[i],startPage:143,endPage:145});
 assert.deepEqual(a.pages,[143,145]);
 assert.throws(()=>{
  const expected=[143,144,145];for(const p of expected)if(!a.pages.includes(p))
   throw Error('PDF_PAGE_COVERAGE_MISSING:'+p);
 },/MISSING:144/);
 await assert.rejects(()=>readIndexedPageWindow({segmentCount:2,
  readSegment:async i=>[{page:146,text:'X'}, {page:144,text:'Y'}][i],
  startPage:143,endPage:150}),/INVALID_INDEXED_PAGE_ORDER_OR_CONTENT/);
});

test('PDF follow-up cannot fall back to memory search due to incomplete local analysis',()=>{
 const html=read('admin/skynet.html');
 const start=html.indexOf('function resolveSkynetPdfForFollowup(');
 const end=html.indexOf('async function fetchIndexedPdfPageWindow(',start);
 assert.ok(start>0&&end>start);
 let review={documentHash:'a'.repeat(64),name:'258.pdf',pageCount:258,
  complete:false,questionHash:'b'.repeat(64)},history=[];
 const source=html.slice(start,end);
 const callbacks=new Function('activeReview','previousAttachedReview','history',
  source+'\nreturn {route:shouldUseIndexedPdfFollowup,resolve:resolveSkynetPdfForFollowup};');
 const state=callbacks(review,()=>null,history);
 assert.equal(state.route('258페이지인데 143~258쪽 공방은 왜 빠졌어?'),true);
 assert.equal(state.resolve().hash,'a'.repeat(64));
 const empty=callbacks(null,()=>null,history);
 assert.equal(empty.route('258페이지인데 143~258쪽 공방은 왜 빠졌어?'),true,
  'without a hash the UI must fail closed, not launch generic search');
 assert.equal(empty.resolve(),null);
 assert.equal(empty.route('오늘 점심 뭐 먹지?'),false);
});

test('PDF follow-up uses actual page context, crosschecks source count, and never requires completed=true',()=>{
 const html=read('admin/skynet.html');
 const start=html.indexOf('async function analyzeIndexedPdfFollowup(');
 const end=html.indexOf('async function analyzeAttachedDocuments(',start);
 const follow=html.slice(start,end);
 assert.match(follow,/readPdfPageSpan\(doc,startPage,pageCount\)/);
 assert.match(follow,/Math\.floor\(pageCount\/2\)\+1/);
 assert.match(follow,/await analyzeAttachedDocuments\(/);
 assert.match(follow,/!previous\?\.complete/);
 assert.doesNotMatch(follow,/if\(!activeReview\|\|!activeReview\.complete/);
 assert.match(html,/admin\/skynet-document-page-context/);
 const router=JSON.parse(read('vercel.json')).rewrites;
 assert.ok(router.some(r=>r.source==='/admin/skynet-document-page-context'&&
  r.destination==='/api/skynet-document-page-context'));
 const api=read('api/skynet-document-page-context.js');
 assert.match(api,/readIndexedPageWindow/);
 assert.match(html,/for\(let page=startPage;page<=endPage;page\+\+\)if\(!seenPages\.has\(page\)\)/);
});
