import {readJson,casePrefix,documents} from '../api/customer-case.js';
import {latestCaseJob} from '../api/customer-analysis-jobs-db.js';
export async function requireOwnedCase(user,caseId){
 if(typeof user!=='string'||!user||!/^SL-[A-Za-z0-9-]{5,40}$/.test(String(caseId||'')))return null;
 const path=casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json';
 const record=await readJson(path);
 if(record?.id===caseId)return record;
 // Migration recovery: a durable, user-scoped analysis job plus preserved
 // document manifests prove ownership even when the case-list index is lost.
 const job=await latestCaseJob(user,caseId);
 if(!job)return null;
 return {id:caseId,recovered:true,intake:{},title:'복구된 사건'};
}
