/**
 * Defensive parser for customer analysis API responses.
 * Never leak HTML error pages or server stack traces into customer UI.
 */
export class AnalysisResponseError extends Error {
  constructor(code, status, retryable = false) {
    super(code);
    this.name = 'AnalysisResponseError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
export async function parseAnalysisResponse(response) {
  if (!response || typeof response.text !== 'function') {
    throw new AnalysisResponseError('INVALID_RESPONSE', 0, true);
  }
  const status = Number(response.status) || 0;
  const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new AnalysisResponseError('RESPONSE_READ_FAILED', status, true);
  }
  if (!raw || !raw.trim()) {
    throw new AnalysisResponseError('EMPTY_SERVER_RESPONSE', status, retryable);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AnalysisResponseError('NON_JSON_SERVER_RESPONSE', status, retryable);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AnalysisResponseError('INVALID_SERVER_PAYLOAD', status, retryable);
  }
  if (!response.ok) {
    const code = typeof data.error === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(data.error)
      ? data.error : 'ANALYSIS_HTTP_ERROR';
    throw new AnalysisResponseError(code, status, retryable);
  }
  return data;
}
export function analysisProgress(job) {
  const cp = job?.checkpoint || {};
  const verified = Number(cp.verifiedPages ?? cp.textVerifiedPages ?? 0);
  const total = Number(cp.totalPages ?? cp.pageCount ?? 0);
  const sourcePercent = total > 0 ? Math.min(100, Math.max(0, Math.floor(100 * verified / total))) : null;
  const complete = job?.status === 'completed' && Boolean(cp.reportPath || cp.reportBlobPath || cp.reportReady);
  return {
    sourcePercent,
    sourceVerified: total > 0 && verified >= total,
    analysisComplete: complete,
    stage: job?.stage || 'unknown',
    status: job?.status || 'unknown',
  };
}

/**
 * Fetch wrapper for analysis UI. Handles network failures, timeouts and
 * non-JSON gateway responses without surfacing raw HTML or user data.
 */
export async function requestAnalysisJson(url,{fetchImpl=fetch,timeoutMs=25000,...options}={}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new AnalysisResponseError('INVALID_REQUEST_TIMEOUT',0,false);
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  if(options.signal?.aborted)throw new AnalysisResponseError('REQUEST_ABORTED',0,false);
  options.signal?.addEventListener?.('abort',onAbort,{once:true});
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(url,{...options,signal:controller.signal,headers:{Accept:'application/json',...options.headers}});
    return await parseAnalysisResponse(response);
  } catch(error) {
    if(error instanceof AnalysisResponseError)throw error;
    if(controller.signal.aborted)throw new AnalysisResponseError(options.signal?.aborted?'REQUEST_ABORTED':'REQUEST_TIMEOUT',0,!options.signal?.aborted);
    throw new AnalysisResponseError('ANALYSIS_NETWORK_ERROR',0,true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort',onAbort);
  }
}
