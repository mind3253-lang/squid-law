import {readJson,casePrefix} from '../api/customer-case.js';
export async function requireOwnedCase(user,caseId){
 if(typeof user!=='string'||!user||!/^SL-[A-Za-z0-9-]{5,40}$/.test(String(caseId||'')))return null;
 const path=casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json';
 const record=await readJson(path);
 return record?.id===caseId?record:null;
}
