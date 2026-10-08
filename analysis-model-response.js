// Strictly parse untrusted model output before citation verification.
// No markdown repair, executable evaluation, or silent truncation.
import {validateFindingsPayload} from './findings-schema.js';

export function parseModelFindings(raw,{maxResponseChars=180000}={}){
 if(typeof raw!=='string'||!raw.trim())throw Error('EMPTY_MODEL_RESPONSE');
 if(!Number.isInteger(maxResponseChars)||maxResponseChars<1)throw Error('INVALID_RESPONSE_LIMIT');
 if(raw.length>maxResponseChars)throw Error('MODEL_RESPONSE_TOO_LARGE');
 let value;
 try{value=JSON.parse(raw);}catch{throw Error('MODEL_RESPONSE_NOT_JSON');}
 return validateFindingsPayload(value);
}
