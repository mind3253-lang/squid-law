#!/usr/bin/env node
// Evaluate a saved pilot result against a synthetic-case checklist, entirely offline.
import {readFile,writeFile} from 'node:fs/promises';
import {evaluateAnalysisFixture} from './analysis-evaluation.js';
const [resultPath,fixturePath,reportPath]=process.argv.slice(2);
if(!resultPath||!fixturePath||!reportPath){
 console.error('Usage: node --experimental-default-type=module evaluate-pilot-cli.js result.json fixture.json report.json');
 process.exitCode=2;
}else{
 try{
  const readBounded=async path=>{
   const raw=await readFile(path,'utf8');
   if(raw.length>2000000)throw Error('EVALUATION_INPUT_TOO_LARGE');
   return JSON.parse(raw);
  };
  const result=await readBounded(resultPath);
  const fixture=await readBounded(fixturePath);
  const evaluation=evaluateAnalysisFixture(result,fixture);
  await writeFile(reportPath,JSON.stringify(evaluation,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Evaluation:',evaluation.passed?'PASS':'REVIEW','findings:',evaluation.findingCount);
  if(!evaluation.passed)process.exitCode=1;
 }catch(error){
  console.error('Evaluation failed:',error.message);
  process.exitCode=2;
 }
}
