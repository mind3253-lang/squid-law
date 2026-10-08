#!/usr/bin/env node
// Manual, local-only pilot. Never run on customer uploads or public requests.
// Input: pre-extracted PDF page text JSON, not a PDF file. No automatic uploads.
import {readFile,writeFile} from 'node:fs/promises';
import {runPrivateAnalysis} from './analysis-private-runner.js';

const [inputPath,outputPath,flag]=process.argv.slice(2);
if(!inputPath||!outputPath||flag!=='--allow-ai-upload'){
 console.error('Usage: node --experimental-default-type=module pilot-analysis-cli.js input.json output.json --allow-ai-upload');
 process.exitCode=2;
}else if(!process.env.OPENAI_API_KEY||!process.env.SQUIDLAW_AI_MODEL){
 console.error('Missing OPENAI_API_KEY or SQUIDLAW_AI_MODEL. No request sent.');
 process.exitCode=2;
}else{
 try{
  const raw=await readFile(inputPath,'utf8');
  if(raw.length>650000)throw Error('INPUT_FILE_TOO_LARGE');
  const documents=JSON.parse(raw);
  if(!Array.isArray(documents))throw Error('EXPECTED_DOCUMENT_ARRAY');
  const result=await runPrivateAnalysis(documents,{
   enabled:true,
   apiKey:process.env.OPENAI_API_KEY,
   model:process.env.SQUIDLAW_AI_MODEL,
   maxBatches:15
  });
  await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Result saved. Source verified:',result.sourceReady,'; findings:',result.findings.length);
 }catch(error){
  console.error('Pilot failed:',error.message);
  process.exitCode=1;
 }
}
