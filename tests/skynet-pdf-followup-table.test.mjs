import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const jobs=readFileSync(new URL('../api/skynet-document-job.js',import.meta.url),'utf8');
function functionBody(startToken,endToken){
 const from=code.indexOf(startToken),to=code.indexOf(endToken,from);
 assert.ok(from>=0&&to>from);
 return code.slice(from,to);
}
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.className='';this.scope=''}
 appendChild(child){this.children.push(child);return child}
}
test('real Markdown comparison tables become semantic and safely rendered tables',()=>{
 const src=functionBody('function markdownTableCells(', 'try{localStorage.removeItem(chatKey)}catch{}');
 const renderer=new Function('document',src+'\nreturn renderSkynetMarkdown;')({
  createElement:tag=>new Element(tag)
 });
 const target=new Element('article');
 renderer(target,
  '## 대조표\n| 쟁점 | 원고 주장 | 피고 주장 |\n|---|---|---|\n| 차임 | **상계** | 4,578만 원 |\n| 하자 | <img src=x onerror=alert(1)> | 부인 |\n\n결론');
 const scroll=target.children.find(x=>x.className==='skynet-table-scroll');
 assert.ok(scroll);
 const table=scroll.children[0];
 assert.equal(table.tagName,'table');
 const head=table.children[0].children[0];
 assert.equal(head.children.length,3);
 const rows=table.children[1].children;
 assert.equal(rows.length,2);
 assert.equal(rows[0].children[0].textContent,'차임');
 assert.equal(rows[1].children[1].textContent,'<img src=x onerror=alert(1)>');
 assert.equal(rows[1].children[1].children.length,0,
  'AI-provided markup must never execute as HTML');
});
test('PDF follow-ups reuse completed source report and indexed late-page raw evidence',()=>{
 assert.match(code,/if\(shouldUseIndexedPdfFollowup\(composed\)\)/);
 const section=functionBody('async function analyzeIndexedPdfFollowup(','async function analyzeAttachedDocuments(');
 assert.match(section,/reviewJobRequest\('status',state\)/);
 assert.match(section,/const start=Math\.floor\(Math\.floor\(count\*0\.5\)\/20\)\*20/);
 assert.match(section,/fetchIndexedPdfContextWindow\(doc\.hash,offset,position\)/);
 assert.match(section,/PDF 원문 색인 버전 불일치/);
 assert.match(section,/documentReviewCheckpoint\(doc,fingerprint,digest,i\+1/);
 assert.match(section,/if\(!done\|\|!chunks\.length\)/);
 assert.match(section,/reviewJobRequest\('finish'/);
 assert.match(section,/await saveAnswer\(/);
 assert.match(jobs,/sourceSegmentCount:job\.sourceSegmentCount/);
});
