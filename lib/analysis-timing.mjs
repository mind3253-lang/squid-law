// Opt-in, privacy-safe wall-clock timings for customer analysis.
// No document contents, identifiers, credentials, or user-supplied paths.
import {performance} from 'node:perf_hooks';
const allowed=new Set(['blob_json_read','blob_binary_read','pdf_extract','vision_primary','vision_audit','legal_reasoning','checkpoint_write']);
export async function timedAnalysisStep(stage,operation,{enabled=process.env.SQUIDLAW_ANALYSIS_TIMING==='1',sink=console.log}={}){
 if(!allowed.has(stage))throw Error('INVALID_TIMING_STAGE');
 if(!enabled)return operation();
 const start=performance.now();
 let outcome='ok';
 try{return await operation()}
 catch(e){outcome='error';throw e}
 finally{
  const durationMs=Math.max(0,Math.round(performance.now()-start));
  // Fixed vocabulary only; avoid logging errors, customer data, URLs or identifiers.
  sink('ANALYSIS_TIMING '+JSON.stringify({stage,outcome,durationMs}));
 }
}
