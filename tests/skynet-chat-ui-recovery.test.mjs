import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');

test('SKYNET inline scripts remain valid JavaScript',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(s=>s.trim());
 assert.ok(scripts.length>=6);
 for(const [i,source] of scripts.entries())assert.doesNotThrow(()=>new Script(source,{filename:'skynet-inline-'+i+'.js'}));
});

test('SKYNET chat does not abandon replies before server timeout without feedback',()=>{
 assert.match(html,/setTimeout\(\(\)=>controller\.abort\(\),180000\)/);
 const chatRequest=html.slice(html.indexOf('async function askSkynet('),html.indexOf('async function reviewSourceText('));
 assert.doesNotMatch(chatRequest,/setTimeout\(\(\)=>controller\.abort\(\),45000\)/);
 assert.match(html,/id="chatErrorStatus"/);
 assert.match(html,/AI 답변 실패/);
 assert.match(html,/history\.at\(-1\)===submittedTurn/);
});