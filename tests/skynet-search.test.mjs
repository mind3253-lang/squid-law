import assert from 'node:assert/strict';
import {tokens,entriesOf,rankIndex} from '../api/skynet-search-index.js';
import {recordId} from '../api/skynet-records.js';
const old={title:'민지 임대차',category:'법률·소송',createdAt:'2023-11-07',messages:[{role:'user',at:'2023-11-07',content:'민지 임대차계약 기간은 5년이며 MOU 종료는 2023년 12월 29일이다.'}]};
const recent={title:'서브마린 운영',category:'서브마린·다이빙',messages:[{role:'assistant',at:'2026-10-09',content:'서브마린 프리다이빙 강습 안내'}]};
assert(tokens('민지 임대차 2023년').includes('임대차'));
assert.equal(tokens('2023년 민지').length,2);
assert.equal(entriesOf(old)[0].at,'2023-11-07');
assert.equal(entriesOf(recent)[0].title,'서브마린 운영');
const entries=[...entriesOf(old),...entriesOf(recent)];
const idx={entries,terms:{}};
for(let i=0;i<entries.length;i++)for(const t of tokens(entries[i].content+' '+entries[i].title+' '+entries[i].category)){const {createHash}=await import('node:crypto');const b=createHash('sha256').update(t).digest('hex').slice(0,3);(idx.terms[b]??=[]).push(i)}
assert.equal(rankIndex(idx,'민지 임대차')[0].category,'법률·소송');
assert.equal(rankIndex(idx,'서브마린')[0].title,'서브마린 운영');
assert.equal(rankIndex(idx,'존재하지않는검색어').length,0);
assert.equal(recordId(' 민지  계약 '),recordId('민지 계약'));
assert.notEqual(recordId('민지 계약'),recordId('민지 해지'));
console.log('SKYNET search and immutable record unit tests passed');
