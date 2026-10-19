// Signed, short-lived customer identity tokens for the independent server.
// Authentication provider must verify identity before issuing a token.
import {createHmac,timingSafeEqual} from 'node:crypto';
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const mac=(body,secret)=>createHmac('sha256',secret).update(body).digest();
export function issueCustomerToken({subject,secret,now=Date.now(),ttlSeconds=1800}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('AUTH_SECRET_TOO_SHORT');
 if(typeof subject!=='string'||subject.length<3||subject.length>256||!/^[-@.:_a-zA-Z0-9]+$/.test(subject))throw Error('INVALID_AUTH_SUBJECT');
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)throw Error('INVALID_TOKEN_TTL');
 const body=b64({v:1,sub:subject,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+ttlSeconds});
 return body+'.'+mac(body,secret).toString('base64url');
}
export function verifyCustomerToken(token,{secret,now=Date.now()}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||typeof token!=='string'||token.length>2048)return null;
 const parts=token.split('.');
 if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;
 const expected=mac(parts[0],secret),received=Buffer.from(parts[1],'base64url');
 if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
 try{
  const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  const current=Math.floor(now/1000);
  if(payload.v!==1||typeof payload.sub!=='string'||payload.sub.length<3||payload.sub.length>256||
   !/^[-@.:_a-zA-Z0-9]+$/.test(payload.sub)||!Number.isSafeInteger(payload.iat)||
   !Number.isSafeInteger(payload.exp)||payload.iat>current+30||payload.exp<=current||
   payload.exp-payload.iat>3600)return null;
  return {subject:payload.sub,expiresAt:payload.exp};
 }catch{return null;}
}
