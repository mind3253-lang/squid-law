import {list,del} from '@vercel/blob';
import {createHash,randomBytes} from 'node:crypto';
const prefixes=['skynet/imports/','skynet/memory/','skynet/documents/','skynet/records/','skynet/db/','skynet/test/'];
const indexPath=p=>'skynet/search-index/'+createHash('sha256').update(p).digest('hex')+'.json';
export function isTemporaryPath(p){return typeof p==='string'&&(p.startsWith('skynet/test/')||prefixes.some(x=>x!=='skynet/test/'&&p.startsWith(x)&&/(?:^|[\\/_-])(test|temp|tmp|sample|dummy|임시|테스트)(?:[\\/_-]|\\.|$)/i.test(p.slice(x.length))))&&!p.includes('..')}
const send=(res,n,x)=>res.status(n).setHeader('Cache-Control','no-store').json(x);
function authorized(req){try{return !!process.env.ADMIN_PASSWORD&&String(req.headers.authorization||'').startsWith('Basic ')&&Buffer.from(String(req.headers.authorization).slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}}
async function scan(){const rows=[];for(const prefix of prefixes){let cursor;do{const page=await list({prefix,limit:1000,...(cursor?{cursor}:{})});for(const f of page.blobs)if(f.pathname.startsWith(prefix))rows.push({path:f.pathname,size:f.size||0,uploadedAt:f.uploadedAt||null,temporary:isTemporaryPath(f.pathname),kind:prefix.slice(7,-1)});cursor=page.hasMore?page.cursor:undefined}while(cursor&&rows.length<100000);if(cursor)throw Error('목록 한도 초과: 삭제 중단')}return rows}
const previews=new Map();
export default async function handler(req,res){
 if(!authorized(req))return send(res,401,{error:'관리자 인증 필요'});
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'GET/POST only'});
 try{
  if(req.method==='GET'){const rows=await scan();return send(res,200,{ok:true,items:rows,total:rows.length,temporary:rows.filter(x=>x.temporary).length})}
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(body.action==='preview'){const requested=Array.isArray(body.paths)?body.paths:[];if(!requested.length||requested.length>100||requested.some(x=>typeof x!=='string'||x.length>500||!isTemporaryPath(x))||new Set(requested).size!==requested.length)return send(res,400,{error:'명시적으로 식별된 임시 자료만 선택 가능'});
   const rows=await scan();if(requested.some(p=>!rows.some(x=>x.path===p&&x.temporary)))return send(res,409,{error:'삭제 대상이 현재 저장소 목록과 다름'});
   const token=randomBytes(24).toString('hex');previews.set(token,{paths:requested,expires:Date.now()+120000});if(previews.size>300)previews.delete(previews.keys().next().value);return send(res,200,{ok:true,token,paths:requested,expiresSeconds:120,notice:'삭제는 복구할 수 없습니다. 확인 버튼을 눌러야 실행됩니다.'});
  }
  if(body.action==='delete'){const token=String(body.token||'');const record=previews.get(token);previews.delete(token);if(!record||record.expires<Date.now()||body.confirm!=='DELETE TEMP DATA')return send(res,400,{error:'삭제 확인이 유효하지 않음'});
   const rows=await scan();if(record.paths.some(p=>!rows.some(x=>x.path===p&&x.temporary)))return send(res,409,{error:'대상이 변경됨: 삭제 중단'});
   const results=[];for(const path of record.paths){try{await del(path);let indexRemoved=false;try{await del(indexPath(path));indexRemoved=true}catch(e){results.push({path,ok:false,indexError:String(e.message).slice(0,120)});continue}results.push({path,ok:true,indexRemoved})}catch(e){results.push({path,ok:false,error:String(e.message).slice(0,120)})}}
   const after=await scan();for(const x of results)if(x.ok&&after.some(r=>r.path===x.path)){x.ok=false;x.error='삭제 후 재조회에서 원본 발견'}
   return send(res,200,{ok:results.every(x=>x.ok),results,remaining:after.length,deleted:results.filter(x=>x.ok).length});
  }
  return send(res,400,{error:'알 수 없는 작업'});
 }catch(e){return send(res,502,{error:'저장소 관리 실패',detail:String(e.message).slice(0,180)})}
}
