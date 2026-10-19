import {timingSafeEqual} from 'node:crypto';
export function diagnosticAuthorized(header,configuredToken){
 if(typeof configuredToken!=='string'||configuredToken.length<32)return false;
 if(typeof header!=='string'||!header.startsWith('Bearer '))return false;
 const supplied=header.slice(7);
 if(supplied.length!==configuredToken.length)return false;
 return timingSafeEqual(Buffer.from(supplied),Buffer.from(configuredToken));
}
export function diagnosticAccessEnabled(host,token){
 // A token alone must never make the diagnostics listener public.
 return (host==='127.0.0.1'||host==='::1')&&typeof token==='string'&&token.length>=32;
}
