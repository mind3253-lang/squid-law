import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const stable=value=>{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
};
export function createAnalysisReceipt({stage,sourceVersion,inputs,outputs,verified=false}){
 if(!stage||!/^[0-9a-f]{64}$/.test(sourceVersion||'')||!Array.isArray(inputs)||!Array.isArray(outputs))throw Error('INVALID_ANALYSIS_RECEIPT');
 const record={stage,sourceVersion,inputs,outputs,verified:verified===true};
 return {...record,digest:hash(stable(record))};
}
export function validateAnalysisReceipt(receipt){
 if(!receipt||typeof receipt.digest!=='string')return false;
 try{const {digest,...data}=receipt;return digest===createAnalysisReceipt(data).digest}catch{return false}
}
