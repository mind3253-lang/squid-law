// Parse Responses API output without trusting model-generated fields.
import {validateFindingsPayload} from './findings-schema.js';
export function parsePilotModelResponse(raw){
 if(!raw||raw.status!=='completed'||raw.error||raw.incomplete_details)throw Error('MODEL_RESPONSE_INCOMPLETE');
 if(!Array.isArray(raw.output))throw Error('INVALID_MODEL_OUTPUT');
 const parts=[];
 for(const message of raw.output){
  if(message?.type!=='message')continue;
  if(message.status&&message.status!=='completed')throw Error('MODEL_MESSAGE_INCOMPLETE');
  if(!Array.isArray(message.content))throw Error('INVALID_MODEL_CONTENT');
  for(const part of message.content){
   if(part?.type==='refusal')throw Error('MODEL_REFUSAL');
   if(part?.type==='output_text'){
    if(typeof part.text!=='string')throw Error('INVALID_MODEL_CONTENT');
    parts.push(part.text);
   }
  }
 }
 const output=parts.join('');
 if(!output||output.length>50000)throw Error('EMPTY_OR_OVERSIZED_MODEL_RESPONSE');
 let parsed;
 try{parsed=JSON.parse(output)}catch{throw Error('INVALID_MODEL_JSON')}
 const validated=validateFindingsPayload(parsed);
 if(validated.findings.length>12)throw Error('TOO_MANY_MODEL_FINDINGS');
 if(validated.findings.some(f=>!f.citations.length))throw Error('MISSING_FINDING_CITATIONS');
 return validated;
}
