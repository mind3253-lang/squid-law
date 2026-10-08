import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../findings-schema.js',import.meta.url),'utf8');
const {validateFindingsPayload}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const valid={schema:'squidlaw-findings-v1',findings:[{title:'계약 관련 주장',citations:[{document:'계약서.pdf',page:2,quote:'계약기간은 5년으로 정한다.'}]}]};
assert.equal(validateFindingsPayload(valid).findings[0].citations[0].page,2);
const bad=[
 null,{schema:'other',findings:[]},{schema:'squidlaw-findings-v1',findings:{}},
 {...valid,findings:[{title:'',citations:[]}]},
 {...valid,findings:[{title:'항목',citations:[{document:'계약서.pdf',page:'2',quote:'계약기간은 5년으로 정한다.'}]}]},
 {...valid,findings:[{title:'항목',citations:[{document:'계약서.pdf',page:0,quote:'계약기간은 5년으로 정한다.'}]}]},
 {...valid,findings:[{title:'항목',citations:[{document:'계약서.pdf',page:2,quote:'짧음'}]}]},
 {...valid,findings:[{title:'항목',citations:[{document:'계약서.pdf',page:2,quote:'가          나'}]}]}
];
for(const item of bad)assert.throws(()=>validateFindingsPayload(item));
console.log('PASS: 1 valid payload + '+bad.length+' invalid payload cases');
