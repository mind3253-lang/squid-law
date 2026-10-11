import {createHash} from 'node:crypto';
export function verifyPageDigests(pages,{requireDigests=false}={}){
 if(!Array.isArray(pages))throw Error('INVALID_PAGE_DIGEST_INPUT');
 const failures=[];
 for(const p of pages){
  const actual=createHash('sha256').update(String(p?.text??'')).digest('hex');
  if(p?.textSha256===undefined||p?.textSha256===null){if(requireDigests)failures.push({page:p?.page,reason:'MISSING_TEXT_HASH'});continue}
  if(p.textSha256!==actual)failures.push({page:p.page,reason:'PAGE_TEXT_HASH_MISMATCH'});
 }
 return {complete:failures.length===0,failures,legacyWithoutHashes:pages.filter(p=>!p?.textSha256).length};
}
