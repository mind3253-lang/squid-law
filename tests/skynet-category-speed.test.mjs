import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {categoryDigestEntries,sourceTopicEntries} from '../lib/skynet-topic-categories.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('338-page classification is a CPU operation, not one remote AI call per page',()=>{
 const pages=Array.from({length:338},(_,i)=>({page:i+1,text:
  i%2?'사주 명리 구성학과 주변 사람 이야기. '.repeat(35):
  '서브마린 여과 순환 시설과 운영 설계. '.repeat(35)}));
 const started=performance.now();
 const digest=categoryDigestEntries(sourceTopicEntries({segments:pages}),{
  source:'test/338',name:'GENOME_두런두런_MASTER_20260913.pdf'});
 assert.equal(digest.units,338);
 assert.ok(digest.counts.interests>0);
 assert.ok(digest.counts.people>0);
 assert.ok(digest.counts.business>0);
 assert.ok(performance.now()-started<8000);
});

test('normal dashboard load performs one aggregate request, never a Blob corpus scan',()=>{
 const client=read('admin/skynet-layout.js');
 const route=read('api/skynet-category-dashboard.js');
 const db=read('lib/skynet-topic-db.mjs');
 const routes=JSON.parse(read('vercel.json')).rewrites;
 assert.match(client,/fetch\('\/admin\/skynet-category-dashboard'/);
 assert.doesNotMatch(client,/skynet-categories\?limit=/);
 assert.doesNotMatch(client,/loadCategoryTotal/);
 assert.match(route,/await topicDashboard\(\)/);
 assert.match(db,/SUM\(\(counts->>/);
 assert.ok(routes.some(x=>x.source==='/admin/skynet-category-dashboard'&&x.destination==='/api/skynet-category-dashboard'));
});

test('migration is once-per-source and uses durable server leases and checkpoints',()=>{
 const worker=read('api/skynet-category-fast-backfill.js');
 const db=read('lib/skynet-topic-db.mjs');
 assert.match(worker,/claimTopicBackfill\(prefix,owner\)/);
 assert.match(worker,/await upsertTopics\(results.records\)/);
 assert.match(worker,/await finishTopicBackfill\(prefix,owner/);
 assert.match(worker,/lease\.offset\+results\.handled/);
 assert.match(db,/lease_until<now\(\)/);
 assert.match(db,/WHERE prefix=\$1 AND owner=\$2/);
 assert.match(db,/ON CONFLICT\(source\) DO UPDATE/);
 assert.doesNotMatch(worker,/searchIndexMulti\(/);
});

test('frontend does not auto-start heavy full-text search reindex',()=>{
 const client=read('admin/skynet-layout.js');
 const chat=read('admin/skynet.html');
 assert.match(client,/navigator\.locks\?\.request/);
 assert.match(client,/ifAvailable:true/);
 assert.match(client,/action:'step'/);
 assert.doesNotMatch(chat,/setTimeout\(backgroundIndex,60000\);\}\)\(\)/);
});

test('new sources make the lightweight classification durable before expensive search indexing',()=>{
 const source=read('api/skynet-search-index.js');
 const write=source.indexOf("await put('skynet/category-index/'");
 const sql=source.indexOf('await upsertTopics([categories])',write);
 const heavy=source.indexOf('const entries=entriesOf(data);',write);
 assert.ok(write>0&&sql>write&&heavy>sql);
});

test('details load lazily instead of downloading all category sidecars at page load',()=>{
 const client=read('admin/skynet-layout.js');
 const route=read('api/skynet-category-dashboard.js');
 assert.match(client,/topic='\+encodeURIComponent\(id\)/);
 assert.match(client,/limit=20/);
 assert.match(route,/Math\.min\(40,Math\.max\(1/);
});
