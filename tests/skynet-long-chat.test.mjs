import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {splitSkynetQuestions} from '../lib/skynet-chat-question-split.mjs';
import {skynetLongTurnLimits} from '../api/skynet-long-turn.js';

const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
test('long 14-question prompt excludes numbered instructions from headings',()=>{
 const rules=Array.from({length:7},(_,i)=>(i+1)+'. 시험 규칙 설명 '+i).join('\n');
 const questions=Array.from({length:14},(_,i)=>'## '+(i+1)+'. 시험문항 '+(i+1)+'\n검증 사항을 찾아 답하라.').join('\n');
 const original='# SKYNET 시험\n'+rules+'\n\n'+questions+'\n\n## 최종 질문\n전체 결과를 설명해라.';
 const result=splitSkynetQuestions(original);
 assert.equal(result.count,14);
 assert.match(result.sections[0].prompt,/## 1\. 시험문항 1/);
 assert.doesNotMatch(result.sections[0].body,/## 2\. 시험문항 2/);
 assert.match(result.sections[13].body,/## 최종 질문/);
 assert.match(result.sections[0].prompt,/시험 규칙 설명/);
});
test('prose and accidental enumerations do not activate question partition',()=>{
 assert.equal(splitSkynetQuestions('기억해줘\n1. 하나\n2. 둘\n3. 셋'),null);
});
test('all inline SKYNET JS scripts are syntactically valid',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length>=6);
 for(const [index,script] of scripts.entries())assert.doesNotThrow(()=>new Script(script,{filename:'skynet-inline-'+index+'.js'}));
});
test('chat message uses uncut original, persistent parts, incremental answers',()=>{
 assert.doesNotMatch(html,/<textarea id="chatInput" maxlength=/);
 assert.doesNotMatch(html,/const composed=\(msg\+fileContext\)\.slice/);
 assert.match(html,/const composed=msg\+context/);
 assert.match(html,/skynet-long-turn/);
 assert.match(html,/Promise\.allSettled\(/);
 assert.match(html,/await saveTurn\('assistant',reply,id\)/);
 assert.ok(skynetLongTurnLimits.maxParts*skynetLongTurnLimits.maxPartChars>=5000000);
});
