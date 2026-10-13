import {get} from '@vercel/blob';

const send=(res,n,data)=>res.status(n).setHeader('Cache-Control','private, no-store')
 .setHeader('Vary','Authorization').json(data);
function authorized(req){
 try{const h=String(req.headers.authorization||'');return !!process.env.ADMIN_PASSWORD&&
 h.startsWith('Basic ')&&Buffer.from(h.slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}
 catch{return false}
}
async function readJSON(path,limit){
 const obj=await get(path,{access:'private'});
 if(!obj||obj.statusCode!==200)return null;
 let n=0;const parts=[];
 for await(const part of obj.stream){
  const b=Buffer.from(part);n+=b.length;
  if(n>limit)throw Error('DOCUMENT_DATA_TOO_LARGE');
  parts.push(b);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function integer(n,max){
 const x=Number(n);
 return Number.isSafeInteger(x)&&x>=0&&x<=max?x:null;
}
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'ADMIN_REQUIRED'});
 if(req.method!=='GET')return send(res,405,{error:'GET_ONLY'});
 const hash=String(req.query?.hash||''),offset=integer(req.query?.offset??0,1000000),
  position=integer(req.query?.position??0,100000000);
 if(!/^[a-f0-9]{64}$/.test(hash)||offset===null||position===null)
  return send(res,400,{error:'INVALID_DOCUMENT_CURSOR'});
 try{
  const manifest=await readJSON('skynet/documents/'+hash+'.json',27*1048576);
  if(!manifest||manifest.hash!==hash)return send(res,404,{error:'DOCUMENT_NOT_INDEXED'});
  const isPdf=Number.isInteger(manifest.segmentCount)&&Number.isInteger(manifest.pageCount);
  const limit=30000;
  if(!isPdf){
   if(typeof manifest.text!=='string')return send(res,409,{error:'DOCUMENT_TEXT_NOT_AVAILABLE'});
   if(position!==0)return send(res,400,{error:'UNEXPECTED_POSITION'});
   if(offset>manifest.text.length)return send(res,400,{error:'INVALID_TEXT_OFFSET'});
   const body=manifest.text.slice(offset,offset+limit),next=offset+body.length;
   return send(res,200,{ok:true,kind:'text',name:manifest.name||'',hash,
    text:body,offset:next,position:0,done:next>=manifest.text.length,
    totalCharacters:manifest.text.length,pageCount:null,ocrRequired:[]});
  }
  if(offset>manifest.segmentCount)return send(res,400,{error:'INVALID_SEGMENT_OFFSET'});
  let i=offset,pos=position,out='',scanned=0;const pages=new Set();
  const loaded=new Map();
  while(i<manifest.segmentCount&&scanned<20&&out.length<limit){
   const first=Math.floor(i/20)*20;
   let batch=loaded.get(first);
   if(!batch){
    const path='skynet/document-segments/'+hash+'/batch-'+String(first).padStart(8,'0')+'.json';
    batch=await readJSON(path,27*1048576);
    if(!batch||!Array.isArray(batch.segments))throw Error('DOCUMENT_SEGMENT_MISSING_AT_'+i);
    loaded.set(first,batch);
   }
   const entry=batch.segments[i-first];
   if(!entry||typeof entry.text!=='string')throw Error('DOCUMENT_SEGMENT_INVALID_AT_'+i);
   const page=Number(entry.page)||null;
   const text=entry.text;
   if(pos>text.length)throw Error('DOCUMENT_CURSOR_OUTSIDE_SEGMENT');
   const header='\n[PDF '+(page||'?')+'쪽 / 구간 '+String(entry.part??i)+']\n';
   const remaining=limit-out.length;
   if(remaining<=header.length+100&&out.length)break;
   const take=Math.min(text.length-pos,Math.max(1,remaining-header.length));
   out+=header+text.slice(pos,pos+take);
   if(page!==null)pages.add(page);
   pos+=take;
   if(pos>=text.length){i++;pos=0;scanned++}
   else break;
  }
  if(i===offset&&pos===position&&i<manifest.segmentCount)throw Error('DOCUMENT_READ_NO_PROGRESS');
  const done=i>=manifest.segmentCount;
  return send(res,200,{ok:true,kind:'pdf',name:manifest.name||'',hash,
   text:out,offset:i,position:pos,done,pageCount:manifest.pageCount,
   segmentCount:manifest.segmentCount,totalCharacters:manifest.characters||null,
   pages:[...pages].sort((a,b)=>a-b),ocrRequired:Array.isArray(manifest.ocrRequired)?manifest.ocrRequired:[],
   textCoverageComplete:done&&!manifest.ocrRequired?.length});
 }catch(e){
  console.error('SKYNET_DOCUMENT_CONTEXT',hash.slice(0,12),String(e.message).slice(0,130));
  return send(res,503,{error:'DOCUMENT_READ_FAILED',detail:String(e.message).slice(0,160)});
 }
}
