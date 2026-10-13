import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {categoryDigestEntries,classifyTopics,TOPIC_CATEGORIES} from '../lib/skynet-topic-categories.mjs';

test('eight category IDs match the on-screen sidebar, with private mode excluded',()=>{
 assert.deepEqual(TOPIC_CATEGORIES.map(x=>x.id),['people','legal','business','development','finance','lifestyle','interests','preferences']);
 assert.equal(TOPIC_CATEGORIES.some(x=>x.id==='privacy'),false);
});
test('GENOME human relationships and fortune topics are genuinely classified',()=>{
 const examples=[
  ['사제 / 부장님 약 28년간 보호해 온 후배 승려, 신호수 교육과 독립적인 판단의 한계','people'],
  ['법원형에게 사면초가 편지를 보내고 부탁하는 사람 손만 잡는다는 원칙을 정했다','people'],
  ['사주 명리 구성학 주역 64괘 요범사훈에 대한 대화와 공부','interests'],
  ['건강과 병원과 수면, 일상생활과 휴식 이야기','lifestyle'],
  ['명리 대화에서 배우자 서현과 내가 서로 다른 역할을 한다고 해석했어','people'],
  ['법원 제출 준비서면과 증거번호 정정, 소송의 진술 모순','legal'],
  ['GitHub Vercel API 개발과 스카이넷 데이터베이스 정리','development'],
  ['서브마린 교육 수익과 시화성 매장 손익 분석','business'],
  ['출처와 정정은 각주로 연결하고 답변은 간결한 반말로 하자','preferences']
 ];
 for(const [content,expected] of examples)assert.ok(classifyTopics(content).includes(expected),expected+': '+content);
});
test('one passage has several tags and preserves its source and page anchor',()=>{
 const summary=categoryDigestEntries([
  {content:'사제와 법원형이 서로 다른 관계로 등장했다.',part:'2:4',page:2},
  {content:'구성학 명리학 사주 팔자를 연구했던 이야기가 있다.',part:'3:1',page:3},
  {content:'배우자와 사주와 요범사훈을 함께 대화했다.',part:'5:1',page:5}
 ],{source:'skynet/document-segments/xyz/batch-00000000.json',name:'GENOME_두런두런_MASTER_20260913.pdf'});
 assert.equal(summary.units,3);
 assert.equal(summary.counts.people,2);
 assert.equal(summary.counts.interests,2);
 assert.equal(summary.examples.people[0].page,2);
 assert.equal(summary.source,'skynet/document-segments/xyz/batch-00000000.json');
});
test('uncertain content is not falsely forced into a category',()=>{
 assert.deepEqual(classifyTopics('이것은 불분명한 자료의 임의 번호 001 이다.'),[]);
});
test('sidebar consumes original source category indexes instead of a narrow legacy database',()=>{
 const sidebar=readFileSync(new URL('../admin/skynet-layout.js',import.meta.url),'utf8');
 const categories=readFileSync(new URL('../api/skynet-categories.js',import.meta.url),'utf8');
 const backfill=readFileSync(new URL('../api/skynet-index-backfill.js',import.meta.url),'utf8');
 const search=readFileSync(new URL('../api/skynet-search-index.js',import.meta.url),'utf8');
 assert.match(sidebar,/\/api\/skynet-categories/);
 assert.match(sidebar,/집계 중/);
 assert.match(sidebar,/categorySources/);
 assert.match(categories,/skynet\/category-index\//);
 assert.match(search,/categoryDigestEntries/);
 assert.match(backfill,/skynet\/document-segments\//);
 assert.match(backfill,/categoryDigestEntries/);
 assert.doesNotMatch(sidebar,/records\.filter\(x=>rules\[i\]/);
});
