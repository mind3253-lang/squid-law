export function parseVisionObservation({documentId,page,imageSha256,response}){
 if(!documentId||!Number.isSafeInteger(page)||page<1||!/^[0-9a-f]{64}$/.test(imageSha256||'')||!response||response.mock===true)return {accepted:false,reason:'INVALID_OR_MOCK_RESPONSE'};
 let value;try{value=typeof response==='string'?JSON.parse(response):response}catch{return {accepted:false,reason:'INVALID_VISION_JSON'}}
 if(value?.mock===true)return {accepted:false,reason:'MOCK_RESPONSE'};
 if(typeof value.observedText!=='string'||!Array.isArray(value.visualFacts)||!Array.isArray(value.uncertainties)||value.visualFacts.some(x=>typeof x!=='string')||value.uncertainties.some(x=>typeof x!=='string'))return {accepted:false,reason:'INVALID_VISION_SCHEMA'};
 return {accepted:true,observation:{documentId,page,imageSha256,observedText:value.observedText,visualFacts:value.visualFacts,uncertainties:value.uncertainties,status:'model_observation_not_independently_verified'},verified:false};
}
export function verifyOcrAgainstPage({observation,sourcePage}){
 if(!observation||!sourcePage||observation.page!==sourcePage.page||observation.documentId!==sourcePage.documentId)return {complete:false,reason:'SOURCE_PAGE_MISMATCH'};
 if(!observation.observedText.trim())return {complete:false,reason:'EMPTY_OCR_TEXT'};
 return {complete:false,reason:'INDEPENDENT_OCR_VERIFICATION_REQUIRED',candidateText:observation.observedText};
}
