import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../source-verification.js',import.meta.url),'utf8');
const {verifyCitation,verifyFindings}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const docs=[{name:'준비서면.pdf',pages:[{text:'2026년 10월 7일\n피고는 금원을 반환한다고 주장하였다.'},{text:''}]}];
const base={document:'준비서면.pdf',page:1,quote:'피고는 금원을 반환한다고 주장하였다.'};
const cases=[
 ['matched',docs,base],
 ['unmatched',docs,{...base,quote:'원고가 계약을 해지하였다는 사실이 확정되었다.'}],
 ['invalid_page',docs,{...base,page:'1'}],
 ['invalid_page',docs,{...base,page:3}],
 ['missing_document',docs,{...base,document:'없는문서.pdf'}],
 ['ambiguous_document',[...docs,...docs],base],
 ['unreadable_page',docs,{...base,page:2}],
 ['invalid_quote',docs,{...base,quote:'반환'}],
 ['invalid',docs,null]
];
for(const [expected,documents,citation] of cases){
 const actual=verifyCitation(documents,citation).status;
 assert.equal(actual,expected,expected+' test failed');
}
const findings=verifyFindings(docs,[{title:'주장',citations:[base,{...base,quote:'문서에 존재하지 않는 인용입니다.'}]},{title:'출처 누락',citations:[]}]);
assert.equal(findings[0].citationChecks[0].verification.status,'matched');
assert.equal(findings[0].citationChecks[1].verification.status,'unmatched');
assert.equal(findings[1].citationChecks.length,0);
console.log('PASS: 9 citation cases + 3 finding checks');
