import test from 'node:test';
import assert from 'node:assert/strict';
import {digestPilotDocuments} from '../private-pilot-digest.js';
const sample=()=>[{name:'a.pdf',pages:[{text:'계약 5년'},{text:'반환'}]}];
test('stable digest',async()=>{assert.equal(await digestPilotDocuments(sample()),await digestPilotDocuments(sample()))});
test('changed text changes digest',async()=>{const changed=sample();changed[0].pages[0].text='계약 2년';assert.notEqual(await digestPilotDocuments(sample()),await digestPilotDocuments(changed))});
test('changed order changes digest',async()=>{const changed=sample();changed[0].pages.reverse();assert.notEqual(await digestPilotDocuments(sample()),await digestPilotDocuments(changed))});
