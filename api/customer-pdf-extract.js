import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
export async function extractPdfPages(buffer,maxPages=100){
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,disableFontFace:true});
 try{
  const pdf=await task.promise;
  const totalPages=pdf.numPages,pages=[];
  for(let n=1;n<=Math.min(totalPages,maxPages);n++){
   const page=await pdf.getPage(n);
   const content=await page.getTextContent();
   const lines=[];let lastY;
   for(const item of content.items){
    const y=item.transform?.[5];
    if(lastY!==undefined&&y!==lastY)lines.push('\n');
    lines.push(item.str||'');lastY=y;
   }
   pages.push({page:n,text:lines.join(' ').slice(0,16000)});
   page.cleanup();
  }
  return {pages,totalPages};
 }finally{await task.destroy()}
}
