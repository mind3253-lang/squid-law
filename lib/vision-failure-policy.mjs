// Classify vision failures without inventing page numbers or retrying deterministic invalid output.
export const VISION_BLOCK_CODES=new Set([
 'VISION_PDF_INVALID_PAGE','VISION_PDF_INVALID_SCHEMA','VISION_PDF_INVALID_UNREVIEWED_PAGE',
 'VISION_PDF_DUPLICATE_PAGE','VISION_PDF_CONFLICTING_PAGE_STATUS',
 'VISION_PDF_INCOMPLETE_PAGE_COVERAGE','VISION_WINDOW_PAGE_COUNT_INVALID'
]);
export function visionFailureDisposition(code,{attempts=0,maxAttempts=3}={}){
 // During owner validation, never automatically repeat a failed model analysis.
 // Preserve the failure and let the operator fix its cause before resuming.
 return {status:VISION_BLOCK_CODES.has(code)?'blocked':'failed',retryable:false};
}
export function visionFailureDiagnostic(error){
 return {
  reason:String(error?.reason||'unknown').slice(0,60),
  index:Number.isSafeInteger(error?.index)?error.index:null,
  windowPageCount:Number.isSafeInteger(error?.windowPageCount)?error.windowPageCount:null,
  pageOffset:Number.isSafeInteger(error?.pageOffset)?error.pageOffset:null,
  providerPage:Number.isSafeInteger(error?.providerPage)||typeof error?.providerPage==='string'?String(error.providerPage).slice(0,30):null,
  providerResponseId:typeof error?.providerResponseId==='string'?error.providerResponseId.slice(0,120):null
 };
}
