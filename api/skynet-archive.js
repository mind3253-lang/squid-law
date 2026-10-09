import {put,list,get} from '@vercel/blob';
import {Readable} from 'node:stream';
const MAX=1024*1024*100;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const reply=(code,obj)=>res.status(code).json(obj);
 if(!process.env.BLOB_READ_WRITE_TOKEN)return reply(503,{error:'비공개 저장소 연결 필요'});
 if(req.method==='GET'){
  if(req.query?.path){
   const path=String(req.query.path);if(!/^skynet\/uploads\/[a-zA-Z0-9_-]+\/\d{5}\.bin$/.test(path))return reply(400,{error:'경로 오류'});
   try{const result=await get(path,{access:'private'});if(!result||result.statusCode!==200)return reply(404,{error:'자료 없음'});res.setHeader('Content-Type','application/octet-stream');return Readable.fromWeb(result.stream).pipe(res)}catch{return reply(502,{error:'파일 읽기 실패'})}
  }
  try{const x=await list({prefix:'skynet/uploads/',limit:1000});return reply(200,{files:x.blobs.map(b=>({pathname:b.pathname,size:b.size})),hasMore:x.hasMore})}catch{return reply(502,{error:'목록 조회 실패'})}
 }
 if(req.method!=='POST')return reply(405,{error:'POST 전용'});
 if(req.headers['content-type']==='application/octet-stream'){const batch=String(req.query?.batch||''),part=Number(req.query?.part),total=Number(req.query?.total);if(!/^[a-zA-Z0-9_-]{8,80}$/.test(batch)||!Number.isInteger(part)||!Number.isInteger(total)||part<0||part>=total||total>100)return reply(400,{error:'조각 정보 오류'});try{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4*1024*1024)return reply(413,{error:'조각 크기 초과'});chunks.push(c)}if(!size)return reply(400,{error:'빈 파일 조각'});const path='skynet/uploads/'+batch+'/'+String(part).padStart(5,'0')+'.bin';await put(path,Buffer.concat(chunks),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/octet-stream'});return reply(200,{ok:true,path,part:part+1,total})}catch(e){return reply(502,{error:'저장 실패',detail:String(e.message).slice(0,120)})}}
 let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{return reply(400,{error:'JSON 오류'})}}
 if(!b||typeof b!=='object'||typeof b.batch!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(b.batch)||!Number.isInteger(b.part)||!Number.isInteger(b.total)||b.part<0||b.part>=b.total||b.total>100||typeof b.data!=='string'||b.data.length>2100000)return reply(400,{error:'업로드 데이터 오류'});
 if(b.encoding!=='base64')return reply(400,{error:'인코딩 오류'});
 const buf=Buffer.from(b.data,'base64');if(buf.length>1536*1024||buf.length===0||buf.length>MAX)return reply(413,{error:'조각 크기 초과'});
 const path='skynet/uploads/'+b.batch+'/'+String(b.part).padStart(5,'0')+'.bin';
 try{await put(path,buf,{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/octet-stream'});return reply(200,{ok:true,path,part:b.part+1,total:b.total})}
 catch(e){return reply(502,{error:'비공개 저장 실패',detail:String(e?.message||'').slice(0,180)})}
}

export const config={api:{bodyParser:false}};
