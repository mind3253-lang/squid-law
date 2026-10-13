import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {retrievalTerms,sourceKind,selectDiverseEvidence} from '../lib/skynet-evidence-rank.mjs';
import {entriesOf,rankIndex,tokens} from '../api/skynet-search-index.js';
import {createHash} from 'node:crypto';

test('historical original outranks repeated handover paragraphs',()=>{
 const q='서브마린의 여과 순환 방식과 수영장 설비 비용 비교';
 const recent='SKYNET 통합 인계서에는 서브마린 여과 순환 시설을 직접 설계했다는 설명이 있다.';
 const detailed='서브마린 여과 순환 설계에서 일반 수영장 방식과 비교했고 펌프 설비 비용을 계산했다.';
 const rows=[
  {source:'skynet/memory/pairs/current.json',content:recent,title:'SKYNET 통합 인계서'},
  {source:'skynet/memory/pairs/current.json',content:recent+' 추가 내용',title:'SKYNET 통합 인계서'},
  {source:'skynet/imports/old/001.json',content:detailed,title:'시설 설계 실제 대화'},
  {source:'skynet/document-segments/old/batch.json',content:detailed+' 관련 표',title:'시설 견적'}
 ];
 const results=selectDiverseEvidence(rows,q,{limit:4});
 assert.equal(results[0].source,'skynet/imports/old/001.json');
 assert.equal(sourceKind(results[1].source),'document');
 assert.ok(results.every(x=>x.matchedTerms>=1));
});
test('Korean case particles and A3-1 identify actual lookup keywords',()=>{
 assert.ok(retrievalTerms('서브마린의 여과 순환 구조는?').includes('서브마린'));
 assert.ok(retrievalTerms('A3-1 입장권의 적립률은 무엇인가').includes('a3-1'));
});
test('PDF page batches are indexable and retain page anchors',()=>{
 const docs=entriesOf({hash:'x',segments:[{page:12,part:2,text:'서브마린 여과 순환 실제 설비 내역'}]});
 assert.ok(docs.length>0);
 assert.equal(docs[0].page,12);
 assert.match(docs[0].content,/PDF 12쪽/);
 assert.equal(sourceKind('skynet/document-segments/x/batch.json'),'document');
});
test('query ranking reaches historical index terms, not only question echoes',()=>{
 const text='A3-1 입장권 마일리지 적립 정책과 결제 취소 처리';
 const terms=new Map(),digest=t=>createHash('sha256').update(t).digest('hex').slice(0,3);
 for(const t of tokens(text)){const bucket=digest(t);if(!terms.has(bucket))terms.set(bucket,new Set());terms.get(bucket).add(0)}
 const index={version:4,entries:[{content:text,source:'skynet/imports/old.json',part:'0:0'}],terms:Object.fromEntries([...terms].map(([k,v])=>[k,[...v]]))};
 const hits=rankIndex(index,'A3-1 입장권의 마일리지 규칙');
 assert.equal(hits.length,1);
});
test('current SKYNET browser scripts compile and show search provenance',()=>{
 const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
 scripts.forEach((source,index)=>assert.doesNotThrow(()=>new Script(source,{filename:'skynet-browser-'+index+'.js'})));
 assert.match(html,/skynet-recall-batch/);
 assert.match(html,/서버 자동검색/);
});
