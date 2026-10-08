#!/usr/bin/env node
// Local-only case report export. Does not contact any server or AI service.
import {readFile,writeFile} from 'node:fs/promises';
import {formatCaseReportText} from './analysis-case-report-text.js';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath||process.argv.length!==4){
 console.error('Usage: node --experimental-default-type=module export-case-report-cli.js case-report.json report.txt');
 process.exitCode=2;
}else{
 try{
  const raw=await readFile(inputPath,'utf8');
  if(raw.length>2_000_000)throw Error('CASE_REPORT_TOO_LARGE');
  const report=JSON.parse(raw);
  const text=formatCaseReportText(report);
  await writeFile(outputPath,text,{flag:'wx',mode:0o600});
  console.log('LOCAL ONLY: report exported, source status='+report.status+', findings='+report.findings.length+', comparisons='+report.comparisons.length);
 }catch(error){
  console.error('Report export failed:',error.message);
  process.exitCode=1;
 }
}
