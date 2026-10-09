import {put,list,get} from '@vercel/blob';
export default async function handler(req,res){
 const send=(code,obj)=>res.status(code).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(obj);
 const auth=String(req.headers.authorization||'');let valid=false;
 try{valid=auth.startsWith('Basic ')&&Buffer.from(auth.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD&&!!process.env.ADMIN_PASSWORD}catch{}
 if(!valid){res.setHeader('WWW-Authenticate','Basic realm="SKYNET Admin"');return send(401,{error:'관리자 인증 필요'})}
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(503,{error:'서버 저장소 미연결'});
 if(req.method==='GET'){try{const result=await list({prefix:'skynet/imports/',limit:1000});return send(200,{files:result.blobs.map(x=>({pathname:x.pathname,size:x.size,uploadedAt:x.uploadedAt})),hasMore:result.hasMore})}catch{return send(502,{error:'보관 목록 조회 실패'})}}
 if(req.method!=='POST'){res.setHeader('Allow','GET,POST');return send(405,{error:'method'})}
 let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{return send(400,{error:'JSON 형식 오류'})}}
 if(!body||typeof body!=='object'||typeof body.name!=='string'||typeof body.data!=='string'||typeof body.batch!=='string'||!Number.isInteger(body.part)||!Number.isInteger(body.total))return send(400,{error:'업로드 형식 오류'});
 if(body.name.length>180||body.data.length>160000||body.batch.length>80||body.part<0||body.total<1||body.total>10000||body.part>=body.total||!/^[a-zA-Z0-9_-]+$/.test(body.batch))return send(413,{error:'업로드 제한 초과'});
 const safe=body.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
 const path='skynet/imports/'+body.batch+'/'+String(body.part).padStart(5,'0')+'-'+safe+'.txt';
 try{await put(path,body.data,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'text/plain;charset=utf-8'});return send(200,{ok:true,part:body.part+1,total:body.total})}catch(e){return send(502,{error:'서버 보관 실패',detail:String(e?.message||'').slice(0,140)})}
}