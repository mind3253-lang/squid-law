// Safe reverse-proxy policy for future HTTPS cutover; no live config changes.
export function validateGabiaProxyRequest({protocol,hostname,allowedHost}){
 if(typeof allowedHost!=='string'||!allowedHost||allowedHost.includes('/'))throw Error('INVALID_ALLOWED_HOST');
 if(protocol!=='https'||hostname!==allowedHost)return {allowed:false,reason:'HTTPS_OR_HOST_REQUIRED'};
 return {allowed:true};
}
export const gabiaSecurityHeaders=Object.freeze({
 'strict-transport-security':'max-age=31536000; includeSubDomains',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'x-frame-options':'DENY',
 'cache-control':'no-store'
});
