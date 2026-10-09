const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export default async function handler(req,res){
 const send=(code,obj)=>res.status(code).setHeader('Cache-Control','no-store').json(obj);
 if(req.method!=='POST')return send(405,{error:'POST only'});
 const auth=req.headers.authorization||'';
 let valid=false;try{const raw=Buffer.from(auth.replace(/^Basic /,''),'base64').toString();valid=auth.startsWith('Basic ')&&raw==='admin:'+process.env.ADMIN_PASSWORD&&!!process.env.ADMIN_PASSWORD}catch{}
 if(!valid)return send(401,{error:'관리자 인증 필요'});
 const key=process.env.OPENAI_API_KEY;if(!key)return send(503,{error:'OPENAI_API_KEY 환경변수 설정 필요'});
 const input=req.body||{};const messages=Array.isArray(input.messages)?input.messages:[];const memories=Array.isArray(input.memories)?input.memories:[];
 if(messages.length>35||memories.length>30)return send(400,{error:'요청 크기 제한'});
 const clean=messages.filter(x=>['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-24).map(x=>({role:x.role,content:x.content.slice(0,12000)}));
 const context=memories.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,1800)).join('\n---\n');
 try{const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:process.env.SKYNET_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:'너는 SKYNET, 한국어로 대화하는 개인 AI 동반자다. 사용자의 과거 기억은 아래에 제공된다. 기억을 근거로 삼되 추측을 사실처럼 말하지 말고, 과거 기록과 현재 지시가 다르면 확인한다.\n기억:\n'+context},...clean],max_completion_tokens:1600})});const data=await upstream.json();if(!upstream.ok)return send(502,{error:'AI 서비스 응답 오류',detail:data.error?.message||'unknown'});return send(200,{reply:data.choices?.[0]?.message?.content||''})}catch(e){return send(502,{error:'AI 연결 실패'})}
}