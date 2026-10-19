import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePdfVisualEvidence} from '../lib/openai-vision-provider.mjs';

const page=n=>({page:n,visualFacts:[],observedText:'',uncertainties:[]});
function fakeProvider(observations){
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({url,method:options.method});
  if(url.endsWith('/files')&&options.method==='POST')
   return {ok:true,status:200,json:async()=>({id:'file-test'})};
  if(url.endsWith('/responses'))
   return {ok:true,status:200,json:async()=>({
    id:'resp-test',status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(observations)}]}]
   })};
  if(url.endsWith('/files/file-test')&&options.method==='DELETE')
   return {ok:true,status:200,json:async()=>({deleted:true})};
  throw Error('UNEXPECTED_TEST_URL');
 };
 return {fetchImpl,calls};
}
const args={documentId:'test-document',pdfBytes:Buffer.from('%PDF-1.7 mock'),
 apiKey:'mock-only',originalPdfSha256:'a'.repeat(64),pageOffset:12,windowPageCount:2};
test('vision provider rejects missing PDF window pages and deletes uploaded file',async()=>{
 const {fetchImpl,calls}=fakeProvider({pageObservations:[page(1)],unreviewedPages:[]});
 await assert.rejects(analyzePdfVisualEvidence({...args,fetchImpl}),/INCOMPLETE_PAGE_COVERAGE/);
 assert.equal(calls.filter(c=>c.method==='DELETE').length,1);
});
test('vision provider preserves original source page indexes',async()=>{
 const {fetchImpl}=fakeProvider({pageObservations:[page('1')],unreviewedPages:['2']});
 const result=await analyzePdfVisualEvidence({...args,fetchImpl});
 assert.deepEqual(result.observations.pageObservations.map(p=>p.page),[13]);
 assert.deepEqual(result.observations.unreviewedPages,[14]);
});
test('vision provider rejects absolute indexes in a relative PDF window',async()=>{
 const {fetchImpl}=fakeProvider({pageObservations:[page(13),page(14)],unreviewedPages:[]});
 await assert.rejects(analyzePdfVisualEvidence({...args,fetchImpl}),/INVALID_PAGE/);
});
test('vision provider refuses unknown window size before uploading',async()=>{
 const {fetchImpl,calls}=fakeProvider({pageObservations:[page(1)],unreviewedPages:[]});
 await assert.rejects(analyzePdfVisualEvidence({...args,windowPageCount:null,fetchImpl}),/WINDOW_PAGE_COUNT_INVALID/);
 assert.equal(calls.length,0);
});
