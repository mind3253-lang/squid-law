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
 assert.match(page,/if\(sourceRevision===requestSourceRevision&&pilotImportRevision===requestImportRevision\)status\.textContent/);
});
