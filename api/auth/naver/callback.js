import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {get,put} from '../../../lib/customer-object-storage.mjs';
const TTL=7*86400;
const hash=s=>createHash('sha256').update(s).digest('hex');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const sign=s=>createHmac('sha256',process.env.SQUID_AUTH_SECRET).update(s).digest('base64url');
const fail=(res,message)=>res.status(400).setHeader('Content-Type','text/plain; charset=utf-8').send(message);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('squid_naver_state='));
 const expected=cookie?.slice('squid_naver_state='.length)||'';
 res.setHeader('Set-Cookie','squid_naver_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/naver; Max-Age=0');
 const actual=String(req.query.state||'');
 const a=Buffer.from(expected),b=Buffer.from(actual);
 if(req.method!=='GET'||!req.query.code||!a.length||a.length!==b.length||!timingSafeEqual(a,b))return fail(res,'인증 요청이 유효하지 않습니다.');
 if(!process.env.NAVER_CLIENT_ID||!process.env.NAVER_CLIENT_SECRET||!process.env.SQUID_AUTH_SECRET||((process.env.SQUIDLAW_OBJECT_BACKEND||'vercel')==='vercel'&&!process.env.BLOB_READ_WRITE_TOKEN))return res.status(503).send('로그인 환경설정을 확인해 주세요.');
 try{
  const origin=process.env.SQUIDLAW_PUBLIC_ORIGIN||'https://squidlaw.co.kr';
  const params=new URLSearchParams({grant_type:'authorization_code',client_id:process.env.NAVER_CLIENT_ID,client_secret:process.env.NAVER_CLIENT_SECRET,code:String(req.query.code),state:actual});
  const tokenResponse=await fetch('https://nid.naver.com/oauth2.0/token?'+params,{method:'GET',headers:{'Accept':'application/json'}});
  const token=await tokenResponse.json();
  if(!tokenResponse.ok||!token.access_token)throw Error('token exchange failed');
  const profileResponse=await fetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:'Bearer '+token.access_token}});
  const profile=await profileResponse.json();
  const naverId=String(profile?.response?.id||'');
  if(!profileResponse.ok||profile.resultcode!=='00'||!naverId||naverId.length>256)throw Error('profile failed');
  const id='naver_'+hash(naverId).slice(0,24);
  const path='squidlaw/users/'+hash(id)+'.json';
  const record={id,provider:'naver',providerHash:hash(naverId),name:String(profile.response.name||'').slice(0,80),email:String(profile.response.email||'').slice(0,180),phone:String(profile.response.mobile||'').slice(0,40),gender:String(profile.response.gender||'').slice(0,10),birthyear:String(profile.response.birthyear||'').slice(0,4),createdAt:new Date().toISOString()};
  const existing=await get(path,{access:'private'}).catch(()=>null);
  if(!existing){try{await put(path,JSON.stringify(record),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'})}catch(e){if(!/already|exist|conflict|409/i.test(String(e?.message)))throw e}}
  const payload=encode({id,exp:Date.now()+TTL*1000});
  res.setHeader('Set-Cookie','squid_session='+payload+'.'+sign(payload)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+TTL);
  return res.redirect(302,origin+'/index.html');
 }catch(e){console.error('naver auth failed',String(e?.message||e).slice(0,120));return res.status(503).send('네이버 로그인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')}
}