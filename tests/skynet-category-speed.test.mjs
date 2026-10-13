import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {categoryDigestEntries,sourceTopicEntries} from '../lib/skynet-topic-categories.mjs';

test('338-page text classification streams without constructing legal search indexes',()=>{
 const pages=Array.from({length:338},(_,i)=>({page:i+1,text:
  i%2?'사주 명리 구성학과 주변 사람 이야기. '.repeat(35):
  '서브마린 여과 순환 시설과 운영 설계. '.repeat(35)}));
 const t=Date.now();
 const summary=categoryDigestEntries(sourceTopicEntries({segments:pages}),{
  source:'test/338',name:'GENOME_두런두런_MASTER_20260913.pdf'});
 assert.equal(summary.units,338);
 assert.ok(summary.counts.interests>0);
 assert.ok(summary.counts.people>0);
 assert.ok(summary.counts.business>0);
 assert.ok(Date.now()-t<8000,'topic-only classification must finish rapidly on text corpus');
});
test('fast category endpoint is independent of costly case-index rebuilding',()=>{
 const endpoint=readFileSync(new URL('../api/skynet-category-fast-backfill.js',import.meta.url),'utf8');
 assert.match(endpoint,/sourceTopicEntries/);
 assert.match(endpoint,/elapsedMs/);
 assert.match(endpoint,/classified/);
 assert.match(endpoint,/hasMore/);
 assert.doesNotMatch(endpoint,/indexSource\(/);
 assert.doesNotMatch(endpoint,/searchIndexMulti\(/);
});
test('frontend visibly reports live progress, errors and rate, not indefinite spinner',()=>{
 const sidebar=readFileSync(new URL('../admin/skynet-layout.js',import.meta.url),'utf8');
 const chat=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.match(sidebar,/skynet-category-fast-backfill/);
 assert.match(sidebar,/건\/초/);
 assert.match(sidebar,/남은 약/);
 assert.match(sidebar,/분류 중단/);
 assert.match(sidebar,/categorySources\.set/);
 assert.match(chat,/categoriesDone/);
 assert.ok(config.rewrites.some(x=>x.source==='/admin/skynet-category-fast-backfill'&&x.destination==='/api/skynet-category-fast-backfill'));
 assert.ok(config.rewrites.some(x=>x.source==='/admin/skynet-categories'&&x.destination==='/api/skynet-categories'));
});

test('partial source pages resume with offset, without dropping files or looping from start',()=>{
 const source=readFileSync(new URL('../api/skynet-category-fast-backfill.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../admin/skynet-layout.js',import.meta.url),'utf8');
 assert.match(source,/const withinPage=offset\+results\.handled<files\.length/);
 assert.match(source,/nextOffset:withinPage\?offset\+results\.handled:0/);
 assert.match(source,/files\.slice\(offset\)/);
 assert.match(client,/nextOffset/);
 assert.match(client,/offset,limit:/);
});
test('classification traffic is not multiplied by every open SKYNET tab',()=>{
 const client=readFileSync(new URL('../admin/skynet-layout.js',import.meta.url),'utf8');
 assert.match(client,/navigator\.locks\?\.request/);
 assert.match(client,/ifAvailable:true/);
 assert.doesNotMatch(client,/void loadCategoryTotal\(\)/);
 assert.match(client,/skynet:source-added/);
});
test('new source gains topic coverage before expensive search indexing',()=>{
 const source=readFileSync(new URL('../api/skynet-search-index.js',import.meta.url),'utf8');
 const write=source.indexOf("await put('skynet/category-index/'");
 const heavy=source.indexOf('const entries=entriesOf(data);',write);
 assert.ok(write>0&&heavy>write,'persist classification ahead of costly full-text index');
});
