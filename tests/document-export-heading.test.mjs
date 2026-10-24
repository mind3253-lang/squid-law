import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {normalizeDocument,renderDocx,renderPrintHtml} from '../lib/document-export.mjs';

test('DOCX and print HTML render headings without markdown markers',()=>{
 const doc=normalizeDocument({title:'법률 분석',text:'## 주요 쟁점\n### 임대차기간\n본문 # 기호는 유지'});
 const html=renderPrintHtml(doc);
 const xml=strFromU8(unzipSync(renderDocx(doc))['word/document.xml']);
 assert.match(html,/<p class="major">주요 쟁점<\/p>/);
 assert.match(html,/<p class="minor">임대차기간<\/p>/);
 assert.match(xml,/>주요 쟁점<\/w:t>/);
 assert.match(xml,/>임대차기간<\/w:t>/);
 assert.doesNotMatch(xml,/>## 주요 쟁점/);
 assert.match(html,/본문 # 기호는 유지/);
 assert.match(xml,/본문 # 기호는 유지/);
});
