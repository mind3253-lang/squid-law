import { timingSafeEqual } from 'node:crypto';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('squid_naver_state='));
 const expected=cookie?.split('=')[1]||'';
 res.setHeader('Set-Cookie','squid_naver_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/naver; Max-Age=0');
 const actual=String(req.query.state||'');
 const a=Buffer.from(expected),b=Buffer.from(actual);
 if(req.method!=='GET'||!req.query.code||!a.length||a.length!==b.length||!timingSafeEqual(a,b))return res.status(400).send('인증 요청이 유효하지 않습니다.');
 // Intentionally no login session until secure user persistence is connected.
 return res.status(503).send('네이버 인증 연동 준비 중입니다. 계정 세션 연결 후 활성화됩니다.');
}