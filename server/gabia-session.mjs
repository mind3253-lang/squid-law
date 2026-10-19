import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeRole} from './gabia-role-policy.mjs';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const sign=(body,secret)=>createHmac('sha256',secret).update(body).digest();
export function issueGabiaSession({subject,role='customer',secret,now=Date.now(),ttlSeconds=1800}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('SESSION_SECRET_MISSING');
 if(typeof subject!=='string'||subject.length<3||subject.length>256||!/^[-@.:_a-zA-Z0-9]+$/.test(subject))throw Error('INVALID_SUBJECT');
 normalizeRole(role);
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)throw Error('INVALID_SESSION_TTL');
 const t=Math.floor(now/1000),body=encode({v:2,sub:subject,role,iat:t,exp:t+ttlSeconds});
 return body+'.'+sign(body,secret).toString('base64url');
}
export function verifyGabiaSession(token,{secret,now=Date.now()}={}){
 if(typeof token!=='string'||token.length>2048||typeof secret!=='string'||Buffer.byteLength(secret)<32)return null;
 const parts=token.split('.');
 if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))return null;
 const expected=sign(parts[0],secret),received=Buffer.from(parts[1],'base64url');
 if(expected.length!==received.length||!timingSafeEqual(expected,received))return null;
 try{
  const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),t=Math.floor(now/1000);
  if(p.v!==2||typeof p.sub!=='string'||p.sub.length<3||p.sub.length>256||!/^[-@.:_a-zA-Z0-9]+$/.test(p.sub))return null;
  normalizeRole(p.role);
  if(!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>t+30||p.exp<=t||p.exp-p.iat>3600)return null;
  return {subject:p.sub,role:p.role,expiresAt:p.exp};
 }catch{return null}
}
