import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../customer.html',import.meta.url),'utf8');
const cli=await readFile(new URL('../scripts/private-model-pilot.mjs',import.meta.url),'utf8');
test('customer imports source digest and validation modules',()=>{
 assert.match(page,/import \{digestPilotDocuments\} from '\.\/private-pilot-digest\.js'/);
 assert.match(page,/import \{validatePilotInput\} from '\.\/private-pilot-input\.js'/);
});
test('customer export validates document limits before saving',()=>{
 assert.match(page,/const info=validatePilotInput\(documents\)/);
 assert.match(page,/if\(pilotExportBtn\.disabled\)return/);
});
test('customer import verifies digest before displaying findings',()=>{
 const digest=page.indexOf('currentDigest!==parsed.sourceDigest');
 const validated=page.indexOf('validatePrivatePilotResult(documents,parsed)');
 assert.ok(digest>0&&validated>digest);
});
test('customer import clears previous verified report before parsing',()=>{
 assert.match(page,/const requestDocuments=documents;[\s\S]*?output\.replaceChildren\(\);verifiedReportText='';/);
});
test('private CLI validates before contacting model',()=>{
 const input=cli.indexOf('validatePilotInput(input)');
 const network=cli.indexOf("fetch('https://api.openai.com/v1/responses'");
 assert.ok(input>0&&network>input);
});
test('private CLI includes source digest in output',()=>{
 assert.match(cli,/const sourceDigest=await digestPilotDocuments\(input\)/);
 assert.match(cli,/sourceDigest,\s*documents:input\.map/);
});

test('PDF replacement invalidates pending AI imports',()=>{
 assert.match(page,/sourceRevision\+\+;pilotImportRevision\+\+;/);
 assert.match(page,/sourceRevision!==requestSourceRevision/);
});
test('newer AI result selection invalidates earlier import',()=>{
 assert.match(page,/requestImportRevision=\+\+pilotImportRevision/);
 assert.match(page,/pilotImportRevision!==requestImportRevision/);
});
test('stale failed import cannot overwrite current status',()=>{
 assert.match(page,/if\(sourceRevision===requestSourceRevision&&pilotImportRevision===requestImportRevision&&resultImportRevision===requestResultRevision\)status\.textContent/);
});

test('new PDF selection snapshots input files',()=>{
 assert.match(page,/const selectedFiles=\[\.\.\.e\.target\.files\]/);
 assert.match(page,/for\(const f of selectedFiles\)/);
});
test('stale PDF extraction cannot append to a newer selection',()=>{
 assert.match(page,/const extractionRevision=sourceRevision/);
 assert.match(page,/if\(extractionRevision!==sourceRevision\)return;/);
});
test('stale extraction cannot refresh analysis controls',()=>{
 assert.match(page,/if\(extractionRevision!==sourceRevision\)return;\s*refreshPilotExport\(\)/);
});

test('PDF page counters commit only after complete extraction',()=>{
 assert.match(page,/let documentEmpty=0/);
 assert.match(page,/pages\+=d\.pages\.length;empty\+=documentEmpty/);
 assert.doesNotMatch(page,/d\.pages\.push\(\{text:extracted\}\);pages\+\+/);
});
test('failed PDF extraction releases document resources',()=>{
 assert.match(page,/finally\{if\(pdf&&!committed\)\{try\{await pdf\.destroy\(\)\}catch\{\}\}\}/);
});
test('only complete PDFs are added to the visible document list',()=>{
 assert.match(page,/documents\.push\(d\);pdfInstances\.push\(pdf\);seenNames\.add\(f\.name\);committed=true/);
});

test('PDF.js has one module loader',()=>{
 assert.equal((page.match(/pdf\.min\.mjs/g)||[]).length,1);
});
test('local findings invalidate pending imported results',()=>{
 assert.match(page,/if\(!documents\.length\)return;\s*resultImportRevision\+\+;pilotImportRevision\+\+;/);
});

test('PDF preview checks the selected page is in range',()=>{
 assert.match(page,/p>pdf\.numPages/);
});
test('PDF preview scales down for narrow screens',()=>{
 assert.match(page,/Math\.max\(160,canvas\.parentElement\.clientWidth-20\)/);
});
test('PDF preview handles unavailable canvas context',()=>{
 assert.match(page,/if\(!context\)throw Error\('CANVAS_CONTEXT_UNAVAILABLE'\)/);
});

test('review JSON imports cancel after PDF replacement',()=>{
 assert.match(page,/sourceRevision!==requestSourceRevision\|\|reviewImportRevision!==requestReviewRevision/);
});
test('review edits invalidate a pending import',()=>{
 assert.match(page,/reviewImportRevision\+\+;reviewRecords\.splice/);
 assert.match(page,/reviewImportRevision\+\+;\s*renderReviews\(\)/);
});

test('new PDF upload clears old analysis overview and index',()=>{
 assert.match(page,/analysis-overview-body'\)\.replaceChildren\(\);document\.getElementById\('local-index'\)\.replaceChildren\(\)/);
});
test('duplicate PDF filenames are rejected before PDF parsing',()=>{
 const duplicate=page.indexOf('seenNames.has(f.name)');
 const parsing=page.indexOf('pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())})');
 assert.ok(duplicate>0&&parsing>duplicate);
 assert.match(page,/duplicateSkipped\+\+;continue/);
});

test('replacing PDFs disables all previous index download controls',()=>{
 assert.match(page,/\['copy-index','download-index','download-data','verify-local-candidates','download-findings'\]/);
 assert.match(page,/button\.disabled=true;button\.onclick=null/);
});
test('index export actions are bound to current PDF revision',()=>{
 assert.match(page,/txt\.onclick=\(\)=>\{if\(extractionRevision===sourceRevision\)/);
 assert.match(page,/json\.onclick=\(\)=>\{if\(extractionRevision===sourceRevision\)/);
 assert.match(page,/candidateBtn\.onclick=\(\)=>\{if\(extractionRevision===sourceRevision\)/);
});

test('review import reports source matched and unverified counts',()=>{
 assert.match(page,/const matched=checked\.filter\(record=>verifyCitation\(documents,/);
 assert.match(page,/원문 문구 일치 '\+matched\+'건 · 확인 필요 '/);
});

test('review labels are explicitly user classifications',()=>{
 assert.match(page,/\[사용자 분류: '\+record\.status/);
 assert.match(page,/인용 문구 일치 \(사실관계 확정 아님\)/);
});

test('page preview handles missing pages safely',()=>{
 assert.match(page,/const p=d\?\.pages\[Number\(pageSelect\.value\)\]/);
 assert.match(page,/if\(!p\)\{textView\.textContent='선택한 페이지가 없습니다\.'/);
});
test('clipboard completion cannot overwrite status after PDF replacement',()=>{
 assert.match(page,/const revision=sourceRevision;const docIndex=Number\(docSelect\.value\)/);
 assert.match(page,/if\(revision===sourceRevision&&Number\(docSelect\.value\)===docIndex/);
});

test('search navigation rejects results from an older PDF revision',()=>{
 assert.match(page,/const searchRevision=sourceRevision/);
 assert.match(page,/if\(searchRevision!==sourceRevision\|\|!documents\[item\.documentIndex\]/);
});

test('failed same-name PDF does not reserve the filename',()=>{
 const duplicate=page.indexOf('seenNames.has(f.name)');
 const parsing=page.indexOf('pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())})');
 const committed=page.indexOf('seenNames.add(f.name)');
 assert.ok(duplicate>0&&parsing>duplicate&&committed>parsing);
 assert.match(page,/documents\.push\(d\);pdfInstances\.push\(pdf\);seenNames\.add\(f\.name\);committed=true/);
});

test('new PDF immediately clears old citation and page controls',()=>{
 assert.match(page,/docSelect\.replaceChildren\(\);pageSelect\.replaceChildren\(\)/);
 assert.match(page,/document\.getElementById\('citation-doc'\)\.replaceChildren\(\)/);
 assert.match(page,/document\.getElementById\('citation-result'\)\.textContent='PDF 처리 중…'/);
});
test('new PDF clears old file and extraction status',()=>{
 assert.match(page,/fileState\.textContent='새 PDF 처리 중…';status\.textContent='새 PDF 처리 중…'/);
});

test('saved review notes pass the same schema as imported notes',()=>{
 assert.match(page,/validateReviewRecords\(\{schema:'squidlaw-review-v1',records:\[candidate\]\}\)/);
 assert.match(page,/reviewRecords\.push\(candidate\)/);
});
test('stale review imports release only their original selected file',()=>{
 assert.ok(page.includes("finally{if(event.target.files?.[0]===f)event.target.value='';}"));
});

test('review save rejects a source PDF that is no longer loaded',()=>{
 assert.match(page,/const source=documents\.find\(d=>d\.name===candidate\.document\)/);
 assert.match(page,/if\(!source\|\|!source\.pages\[candidate\.page-1\]\)/);
});
test('review export validates its payload and refuses malformed records',()=>{
 assert.match(page,/const records=validateReviewRecords\(\{schema:'squidlaw-review-v1',records:reviewRecords\}\)/);
 assert.match(page,/검토 기록 형식에 오류가 있어 내보내지 않았습니다/);
});
test('PDF replacement resets the review import status message',()=>{
 assert.match(page,/이전 검토 기록은 초기화했습니다/);
});

test('review save avoids accidental identical duplicate notes',()=>{
 assert.match(page,/reviewRecords\.some\(r=>r\.document===candidate\.document&&r\.page===candidate\.page/);
 assert.match(page,/동일한 검토 기록이 이미 저장되어 있습니다/);
});
