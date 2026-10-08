// Shared limits for local export and private model pilot.
// This validator does not transmit or persist document text.
export function validatePilotInput(documents){
 if(!Array.isArray(documents)||documents.length<1||documents.length>12)throw Error('INVALID_DOCUMENT_COUNT');
 const names=new Set();let pages=0,characters=0,readable=0;
 for(const d of documents){
  if(!d||typeof d.name!=='string'||!d.name.trim()||d.name.length>300||names.has(d.name)||!Array.isArray(d.pages)||d.pages.length<1)throw Error('INVALID_DOCUMENT');
  names.add(d.name);pages+=d.pages.length;
  for(const p of d.pages){
   if(!p||typeof p.text!=='string'||p.text.length>12000)throw Error('INVALID_PAGES');
   characters+=p.text.length;if(p.text.trim())readable++;
  }
 }
 if(pages>50)throw Error('PILOT_PAGE_LIMIT_50');
 if(characters>60000)throw Error('PILOT_INPUT_LIMIT_60000_CHARS');
 if(!readable)throw Error('NO_READABLE_PAGES');
 return {documents:documents.length,pages,characters,readable};
}
