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
   const q=String(req.query?.q||'').trim().slice(0,120);const selected=q?files.slice(-500):files.slice(-40);
   const groups=[];
   for(let i=0;i<selected.length;i+=8){
    const batch=await Promise.all(selected.slice(i,i+8).map(async file=>{
     const obj=await get(file.pathname,{access:'private'});
     if(!obj||obj.statusCode!==200)throw Error('기억 파일을 읽을 수 없습니다');
     const chunks=[];let length=0;
     for await(const part of obj.stream){const chunk=Buffer.from(part);length+=chunk.length;if(length>50000)throw Error('기억 파일 크기 초과');chunks.push(chunk)}
     const item=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(!item||!Array.isArray(item.messages))throw Error('기억 데이터 형식 오류');
     return item.messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,12000)}));
    }));
    groups.push(...batch);
   }
   const entries=groups.flat();
   if(q){const terms=[...new Set(q.normalize('NFKC').toLowerCase().split(/\\s+/).filter(x=>x.length>1))].slice(0,8);const matches=entries.filter(m=>{const t=m.content.normalize('NFKC').toLowerCase();return terms.some(w=>t.includes(w))}).slice(-20);return send(res,200,{messages:matches,hasMore:files.length>500,search:true})}
   return send(res,200,{messages:entries.slice(-1000),hasMore:files.length>40});
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