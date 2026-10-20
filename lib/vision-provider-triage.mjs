// Pure provider-output triage: never silently renumber source evidence.
import {validateVisionWindowPages} from './vision-page-validation.mjs';
export function inspectVisionProviderOutput(parsed,{pageOffset=0,windowPageCount}={}){
 try{
  const normalized=validateVisionWindowPages(parsed,{pageOffset,windowPageCount});
  return {valid:true,normalized,diagnostic:null};
 }catch(error){
  const index=Number.isSafeInteger(error?.index)?error.index:null;
  return {valid:false,normalized:null,diagnostic:{
   code:String(error?.code||error?.message||'VISION_VALIDATION_FAILED'),
   reason:String(error?.reason||'unspecified'),
   pageOffset,windowPageCount,
   index,providerPage:index===null?null:parsed?.pageObservations?.[index]?.page??null,
   observedPages:Array.isArray(parsed?.pageObservations)?parsed.pageObservations.map(x=>x?.page).slice(0,20):[],
   unreviewedPages:Array.isArray(parsed?.unreviewedPages)?parsed.unreviewedPages.slice(0,20):[]
  }};
 }
}
