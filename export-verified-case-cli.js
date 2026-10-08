#!/usr/bin/env node
// Export a source-rechecked report using original, locally extracted PDF text.
// No network, AI call, payment or user data retention.
import {readFile,writeFile} from 'node:fs/promises';
import {assembleVerifiedCaseAnalysis} from './analysis-case-report.js';
import {formatCaseReportText} from './analysis-case-report-text.js';

const [documentsPath,analysisPath,comparisonPath,outputPath]=process.argv.slice(2);
if(process.argv.length!==6||!documentsPath||!analysisPath||!comparisonPath||!outputPath){
 console.error('Usage: node --experimental-default-type=module export-verified-case-cli.js documents.json analysis.json comparison.json report.txt');
 process.exitCode=2;
}else{
 try{
  const readJson=async(path,limit)=>{
   const raw=await readFile(path,'utf8');
   if(raw.length>limit)throw Error('INPUT_TOO_LARGE');
   return JSON.parse(raw);
  };
  const documentsInput=await readJson(documentsPath,1_500_000);
  const documents=Array.isArray(documentsInput)?documentsInput:documentsInput.documents;
  const analysis=await readJson(analysisPath,2_000_000);
  const comparison=await readJson(comparisonPath,2_000_000);
  const report=assembleVerifiedCaseAnalysis(documents,analysis,comparison);
  const text=formatCaseReportText(report);
  await writeFile(outputPath,text,{flag:'wx',mode:0o600});
  console.log('OFFLINE VERIFIED EXPORT: '+report.status+' · findings='+report.findings.length+' · comparisons='+report.comparisons.length);
 }catch(error){
  console.error('Verified report export failed:',error.message);
  process.exitCode=1;
 }
}
