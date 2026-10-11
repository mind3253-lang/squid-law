import {get,put} from '@vercel/blob';
import {createHash,createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const COOKIE='squid_session',TTL=7*86400;
const hash=s=>createHash('sha256').update(s).digest('hex');
const path=id=>'squidlaw/users/'+hash(id)+'.json';
const fail=(res,status,error)=>res.status(status).setHeader('Cache-Control','no-store').json({error});
const normalize=s=>String(s||'').trim().toLowerCase();
const sign=s=>createHmac('sha256',process.env.SQUID_AUTH_SECRET).update(s).digest('base64url');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const cookie=(token,age)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function session(req){try{const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!raw)return null;const [payload,mac]=raw.split('.');if(!payload||!mac||!timingSafeEqual(Buffer.from(sign(payload)),Buffer.from(mac)))return null;const obj=JSON.parse(Buffer.from(payload,'base64url').toString());return obj.exp>Date.now()&&typeof obj.id==='string'?obj:null}catch{return null}}
export function authenticatedUser(req){return session(req)?.id||null}
async function load(id){const x=await get(path(id),{access:'private'}).catch(()=>null);if(!x||x.statusCode!==200)return null;let bytes=0,parts=[];for await(const chunk of x.stream){bytes+=chunk.length;if(bytes>10000)throw Error('record oversized');parts.push(Buffer.from(chunk))}return JSON.parse(Buffer.concat(parts).toString('utf8'))}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
if(!process.env.SQUID_AUTH_SECRET||!process.env.BLOB_READ_WRITE_TOKEN)return fail(res,503,'회원 서비스 준비 중');
if(req.method==='GET'){const id=authenticatedUser(req);return id?res.status(200).json({authenticated:true,id}):res.status(200).json({authenticated:false})}
if(req.method!=='POST')return fail(res,405,'허용되지 않은 요청');
if(Number(req.headers['content-length']||0)>5000)return fail(res,413,'요청이 너무 큽니다');
const origin=req.headers.origin;const host=req.headers.host;if(origin){let o;try{o=new URL(origin)}catch{return fail(res,403,'요청 출처 오류')}if(o.host!==host||o.protocol!=='https:')return fail(res,403,'요청 출처 오류')}
let b=req.body;try{if(typeof b==='string')b=JSON.parse(b)}catch{return fail(res,400,'입력 오류')}
const action=String(b?.action||'');
if(action==='logout'){res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({ok:true})}
if(!['register','login'].includes(action))return fail(res,400,'요청 오류');
const id=normalize(b?.id),password=String(b?.password||'');
if(!(action==='login'&&/^a[123]$/.test(id))&&!/^[a-z0-9][a-z0-9_-]{3,29}$/.test(id)||password.length<10||password.length>128)return fail(res,400,'아이디는 영문·숫자 4~30자, 비밀번호는 10~128자로 입력해 주세요');
try{
let user=await load(id);
if(action==='register'){
if(user)return fail(res,409,'이미 사용 중인 아이디입니다');
const salt=randomBytes(24).toString('hex'),derived=scryptSync(password,salt,64).toString('hex');
user={id,salt,derived,createdAt:new Date().toISOString()};
try{await put(path(id),JSON.stringify(user),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'})}catch(e){if(/already|exist|conflict|409/i.test(String(e?.message)))return fail(res,409,'이미 사용 중인 아이디입니다');throw e}
}else{
const fakeSalt='000000000000000000000000000000000000000000000000';
const computed=scryptSync(password,user?.salt||fakeSalt,64);
const expected=Buffer.from(user?.derived||'0'.repeat(128),'hex');
if(!user||expected.length!==computed.length||!timingSafeEqual(computed,expected))return fail(res,401,'아이디 또는 비밀번호가 일치하지 않습니다');
}
const payload=encode({id,exp:Date.now()+TTL*1000});res.setHeader('Set-Cookie',cookie(payload+'.'+sign(payload),TTL));
return res.status(200).json({ok:true,id});
}catch(e){console.error('auth operation failed',String(e?.message||e).slice(0,120));return fail(res,503,'회원 저장소 연결을 확인해 주세요')}
}
