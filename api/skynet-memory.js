import {put,list,get} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
const prefix='skynet/memory/';
const send=(res,code,data)=>res.status(code).setHeader('Cache-Control','no-store').json(data);
export default async function handler(req,res){
 if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:'기억 저장소 연결 필요'});
 if(req.method==='GET'){
  try{
   const files=[];let cursor;
   do{
    const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});
    files.push(...page.blobs);
    cursor=page.hasMore?page.cursor:undefined;
   }while(cursor&&files.length<5000);
   files.sort((a,b)=>String(a.uploadedAt||'').localeCompare(String(b.uploadedAt||'')));
   const selected=files.slice(-500);
   const entries=[];
   for(const file of selected){
    try{
     const obj=await get(file.pathname,{access:'private'});
     if(!obj||obj.statusCode!==200)continue;
     const chunks=[];
     for await(const part of obj.stream)chunks.push(Buffer.from(part));
     const item=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(item&&Array.isArray(item.messages))entries.push(...item.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,12000)})));
    }catch{}
   }
   return send(res,200,{messages:entries.slice(-1000),hasMore:files.length>500});
  }catch(e){return send(res,502,{error:'서버 기억 불러오기 실패',detail:String(e?.message||'').slice(0,120)})}
 }
 if(req.method!=='POST')return send(res,405,{error:'허용되지 않은 요청'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;
 const messages=body?.messages;
 if(!Array.isArray(messages)||messages.length!==2||messages[0]?.role!=='user'||messages[1]?.role!=='assistant'||messages.some(m=>typeof m.content!=='string'||!m.content.trim()||m.content.length>12000))return send(res,400,{error:'기억 형식 오류'});
 try{
  const pathname=prefix+Date.now()+'-'+randomUUID()+'.json';
  await put(pathname,JSON.stringify({messages:messages.map(m=>({role:m.role,content:m.content})),savedAt:new Date().toISOString()}),{access:'private',addRandomSuffix:false,contentType:'application/json'});
  return send(res,200,{ok:true});
 }catch(e){return send(res,502,{error:'기억 저장 실패',detail:String(e?.message||'').slice(0,120)})}
}