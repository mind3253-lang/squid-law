// Independent Gabia customer UI shell. Deliberately disabled until auth/API/storage cutover.
import {createServer} from 'node:http';
const host=process.env.SQUIDLAW_CUSTOMER_WEB_HOST||'127.0.0.1';
const port=Number(process.env.SQUIDLAW_CUSTOMER_WEB_PORT||3082);
if(host!=='127.0.0.1'&&host!=='::1')throw Error('CUSTOMER_WEB_LOOPBACK_ONLY');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_CUSTOMER_WEB_PORT');
if(process.env.SQUIDLAW_CUSTOMER_WEB_PREVIEW!=='1')throw Error('CUSTOMER_WEB_PREVIEW_DISABLED');
const headers={
 'content-type':'text/html; charset=utf-8','cache-control':'no-store',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'
};
const page='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SQUIDLAW 준비 중</title><main style="font-family:system-ui;max-width:650px;margin:15vh auto;padding:24px"><h1>SQUIDLAW</h1><p>독립 서버 연결 준비 중입니다.</p><p>고객 로그인과 파일 제출은 아직 활성화되지 않았습니다.</p></main></html>';
createServer((req,res)=>{
 if(req.method!=='GET'||req.url!=='/'){res.writeHead(404,{'cache-control':'no-store'});res.end();return;}
 res.writeHead(200,headers);res.end(page);
}).listen(port,host,()=>console.log('CUSTOMER_WEB_PREVIEW_LOOPBACK_ONLY',port));
