import {randomUUID} from 'node:crypto';
import {put} from '@vercel/blob';
import {guard,respond,all,readJson,casePrefix} from './customer-case.js';
const idOk=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const types={b:'대여·금전',c:'임대·명도',d:'매매·물품',e:'공사·용역',f:'손해·부당이득',g:'계약분쟁',h:'채권·가압류'};
const base=user=>casePrefix(user,'_index').replace(/_index\/$/,'');
export async function registeredCase(user,id){if(!idOk(id))return null;return readJson(base(user)+'registry/'+id+'.json')}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(req.method==='GET'){try{const rows=await all(base(auth.user)+'registry/',500);const cases=(await Promise.all(rows.filter(x=>x.pathname.endsWith('.json')).map(x=>readJson(x.pathname).catch(()=>null)))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return respond(res,200,{cases})}catch{return respond(res,502,{error:'사건 목록 조회 실패'})}}
 if(req.method!=='POST')return respond(res,405,{error:'GET/POST만 지원'});
 let body=req.body;try{if(typeof body==='string')body=JSON.parse(body)}catch{return respond(res,400,{error:'요청 형식 오류'})}
 const type=String(body?.type||'');if(!types[type])return respond(res,400,{error:'사건 유형을 선택해 주세요'});
 const id='SL-'+Date.now().toString(36)+'-'+randomUUID().slice(0,8),createdAt=new Date().toISOString();
 const item={id,type,title:types[type],createdAt,updatedAt:createdAt};
 try{await put(base(auth.user)+'registry/'+id+'.json',JSON.stringify(item),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});return respond(res,201,{case:item})}catch{return respond(res,502,{error:'사건 등록 실패'})}
}
