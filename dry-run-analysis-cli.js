#!/usr/bin/env node
// Offline rehearsal of the full analysis pipeline. NO network or model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {createAnalysisJob,finishAnalysisJob} from './analysis-pipeline.js';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath){
 console.error('Usage: node --experimental-default-type=module dry-run-analysis-cli.js input.json output.json');
 process.exitCode=2;
}else{
 try{
  const raw=await readFile(inputPath,'utf8');
  if(raw.length>650000)throw Error('INPUT_FILE_TOO_LARGE');
  const documents=JSON.parse(raw);
  const job=createAnalysisJob(documents);
  const responses=job.plan.batches.map(batch=>({
   batch:batch.batch,
   payload:{
    schema:'squidlaw-findings-v1',
    findings:batch.pages.map(p=>({
     title:'원문 페이지 인용 시험: '+p.document+' '+p.page+'쪽',
     citations:[{document:p.document,page:p.page,quote:p.text.slice(0,Math.min(p.text.length,300))}]
    })).filter(f=>f.citations[0].quote.trim().length>=8)
   }
  }));
  const result=finishAnalysisJob(job,responses);
  await writeFile(outputPath,JSON.stringify({...result,mode:'offline-fixture-not-ai'},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('OFFLINE ONLY: sourceReady='+result.sourceReady+', findings='+result.findings.length+', batches='+job.plan.batches.length);
 }catch(error){
  console.error('Dry run failed:',error.message);
  process.exitCode=1;
 }
}
