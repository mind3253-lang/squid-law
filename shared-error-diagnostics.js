/* Shared safe client diagnostics for SQUIDLAW and SKYNET.
   Captures only sanitized metadata; never request bodies, tokens or document text. */
(()=>{'use strict';
 const MAX=80,KEY='squidlaw:error-diagnostics:v1';
 const clean=(v,n=240)=>String(v??'').replace(/(Bearer\s+)[^\s]+/ig,'$1[redacted]').replace(/(sk-[A-Za-z0-9_-]{8,})/g,'[redacted]').replace(/([?&](?:token|key|secret|password|code)=)[^&\s]+/ig,'$1[redacted]').slice(0,n);
 const stackLocation=e=>{const line=String(e?.stack||'').split('\n').find(x=>/https?:|\.js:\d+/.test(x))||'';return clean(line.replace(/https?:\/\/[^/]+/g,''),220)};
 const records=[];
 const emit=(type,error,meta={})=>{try{
  const entry={time:new Date().toISOString(),id:'ERR-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),app:location.pathname.startsWith('/admin/skynet')?'SKYNET':'SQUIDLAW',type:clean(type,48),name:clean(error?.name||'Error',48),code:clean(error?.code||meta.code||'',100),message:clean(error?.message||error||'',320),location:stackLocation(error),stage:clean(meta.stage||'',80)};
  records.push(entry);if(records.length>MAX)records.shift();
  try{sessionStorage.setItem(KEY,JSON.stringify(records))}catch{}
  console.error('[DIAGNOSTIC]',entry);
  window.dispatchEvent(new CustomEvent('squidlaw:diagnostic',{detail:entry}));
  return entry.id;
 }catch{return null}};
 try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'[]');if(Array.isArray(saved))records.push(...saved.slice(-MAX))}catch{}
 window.SQUID_DIAGNOSTICS=Object.freeze({capture:emit,list:()=>records.slice(),export:()=>JSON.stringify(records,null,2),clear:()=>{records.length=0;try{sessionStorage.removeItem(KEY)}catch{}}});
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async function(input,init){
  const started=Date.now();
  let path='unknown';try{const url=new URL(typeof input==='string'?input:input.url,location.href);path=url.pathname}catch{}
  const method=clean(init?.method||(typeof input==='object'?input.method:'GET')||'GET',12);
  try{
   const response=await nativeFetch(input,init);
   if(!response.ok&&path.startsWith('/api/')){
    const e=new Error('HTTP '+response.status+' '+(response.statusText||''));
    e.code='HTTP_'+response.status;
    emit('api_http_error',e,{stage:method+' '+path});
   }
   return response;
  }catch(e){if(path.startsWith('/api/'))emit('api_network_error',e,{stage:method+' '+path});throw e}
 };
 window.addEventListener('squidlaw:diagnostic',()=>{});
 window.addEventListener('error',event=>{if(event.error)emit('uncaught_exception',event.error);else emit('resource_error',new Error(clean(event.filename||event.target?.src||'Resource failed',180)))},true);
 window.addEventListener('unhandledrejection',event=>emit('unhandled_rejection',event.reason instanceof Error?event.reason:new Error(clean(event.reason))));
})();