/**
 * SQUIDLAW file billing and conversion policy — dormant integration module.
 * Not imported by production routes. No conversion engine or payment gateway is invoked.
 * Monetary "pages" are internal prepaid usage units, not cryptocurrency.
 */
export const FILE_POLICY_VERSION = '2026-10-11';
export const DIRECT_EXTENSIONS = Object.freeze(['pdf','png','jpg','jpeg']);
export const CONVERTIBLE_EXTENSIONS = Object.freeze(['hwp','hwpx','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','txt','rtf']);
export const FILE_STATES = Object.freeze({
  AWAITING_APPROVAL:'awaiting_approval',QUEUED:'queued',CONVERTING:'converting',
  READY:'ready',FAILED:'failed',REJECTED:'rejected',DELETED:'deleted'
});
export function classifyUpload({filename,detectedMime,encrypted=false}){
  if(encrypted)return {action:'reject',reason:'PASSWORD_PROTECTED'};
  const extension=String(filename||'').split('.').pop().toLowerCase();
  if(!filename||!filename.includes('.'))return {action:'reject',reason:'UNKNOWN_FORMAT'};
  // Caller must validate file signatures / actual type; never trust extension alone.
  if(!detectedMime)return {action:'inspect',reason:'MIME_VERIFICATION_REQUIRED'};
  if(DIRECT_EXTENSIONS.includes(extension))return {action:'direct',extension};
  if(CONVERTIBLE_EXTENSIONS.includes(extension))return {action:'quote_conversion',extension};
  return {action:'reject',reason:'UNSUPPORTED_FORMAT'};
}
export function calculateQuote({basePages,conversionPages=0,analysisPages=0}){
  for(const n of [basePages,conversionPages,analysisPages])
    if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_PAGE_UNITS');
  return {basePages,conversionPages,analysisPages,totalPages:basePages+conversionPages+analysisPages};
}
export function canReservePages({balancePages,quote,approved}){
  return approved===true && Number.isSafeInteger(balancePages) && balancePages>=quote.totalPages;
}
/**
 * Integration invariants:
 * - Original bytes immutable; persist hash and separate storage key.
 * - Conversion jobs only after explicit quote approval and atomic page reservation.
 * - Reject encrypted/password-protected input (no password collection or bypass).
 * - Excel conversion must not evaluate/recalculate formulas or run macros.
 * - If saved display values cannot be faithfully rendered, fail closed.
 * - Workers process queued jobs with concurrency/CPU/memory/time limits.
 * - A failed conversion releases reserved conversion units; settlement is idempotent.
 * - Converted PDFs downloadable by owner, with access checks and audit trail.
 * - Storage charges reflect retained original + converted bytes; deletion changes future usage.
 * - Evidence retention/legal holds override physical deletion; explain to user.
 * - Validate MIME signatures, scan files, sandbox converters; never execute embedded scripts.
 */
export const FILE_RECORD_FIELDS=Object.freeze([
 'id','ownerId','caseId','originalName','originalMime','originalStorageKey',
 'originalSha256','originalBytes','convertedPdfStorageKey','convertedPdfSha256',
 'convertedBytes','conversionStatus','conversionError','quotePages',
 'reservedPages','chargedPages','createdAt','convertedAt','deletedAt','legalHold'
]);
export const REQUIRED_OPERATIONS=Object.freeze([
 'inspectAndRejectEncrypted','quoteAndRequestApproval','reservePagesAtomically',
 'enqueueConversion','convertWithoutSpreadsheetRecalculation',
 'verifyOutputAndHash','settleOrReleasePages','listOwnerFiles',
 'authorizeOriginalDownload','authorizeConvertedDownload',
 'meterStoredBytes','deleteOrRetainForLegalHold'
]);
