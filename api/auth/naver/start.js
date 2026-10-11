import { randomBytes } from 'node:crypto';
export default function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 const id=process.env.NAVER_CLIENT_ID;
 const origin=process.env.SQUIDLAW_PUBLIC_ORIGIN||'https://squidlaw.co.kr';
 if(!id||!process.env.NAVER_CLIENT_SECRET)return res.status(503).send('네이버 로그인 준비 중입니다.');
 const state=randomBytes(24).toString('hex');
 res.setHeader('Set-Cookie','squid_naver_state='+state+'; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/naver; Max-Age=600');
 const url=new URL('https://nid.naver.com/oauth2.0/authorize');
 for(const [k,v] of Object.entries({response_type:'code',client_id:id,redirect_uri:origin+'/api/auth/naver/callback',state}))url.searchParams.set(k,v);
 res.redirect(302,url.toString());
}