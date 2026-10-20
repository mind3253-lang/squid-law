// Redact sensitive fields from Gabia operational events before logging.
const privateKeys=/token|secret|password|authorization|cookie|body|content|email|customer|subject|filename|path|api.?key/i;
export function safeGabiaLog(event){
 if(!event||typeof event!=='object'||Array.isArray(event))throw Error('INVALID_LOG_EVENT');
 const result={};
 for(const [key,value] of Object.entries(event)){
  if(privateKeys.test(key))continue;
  if(!/^[a-z][a-zA-Z0-9_]{0,50}$/.test(key))continue;
  if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))result[key]=value;
  else if(typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value))result[key]=value;
 }
 return result;
}
