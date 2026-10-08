// Browser-side source citation verification for future AI findings.
// A citation verifies that a quotation appears in a PDF's extracted text;
// it does NOT verify that the quoted factual assertion is true.
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
export function verifyCitation(documents,citation){
 if(!citation||typeof citation!=='object')return {status:'invalid',reason:'출처 형식 오류'};
 if(!Array.isArray(documents))return {status:'invalid',reason:'원본 문서 목록 오류'};
 const matches=documents.filter(d=>d&&typeof d==='object'&&d.name===citation.document);
 if(!matches.length)return {status:'missing_document',reason:'해당 PDF가 없음'};
 if(matches.length>1)return {status:'ambiguous_document',reason:'동일한 파일명의 PDF가 여러 개 있어 출처를 특정할 수 없음'};
 const doc=matches[0];
 const page=citation.page;
 if(!Array.isArray(doc.pages)||!Number.isInteger(page)||page<1||page>doc.pages.length)return {status:'invalid_page',reason:'페이지 범위 오류'};
 const quote=normalize(citation.quote);
 if(quote.length<8)return {status:'invalid_quote',reason:'원문 인용이 너무 짧음'};
 const source=normalize(doc.pages[page-1]?.text);
 if(!source)return {status:'unreadable_page',reason:'텍스트 추출이 되지 않은 페이지'};
 if(source.includes(quote))return {status:'matched',reason:'PDF 추출 원문에서 인용 문구 확인'};
 return {status:'unmatched',reason:'해당 페이지에서 인용 문구를 찾지 못함'};
}
export function verifyFindings(documents,findings){
 if(!Array.isArray(findings))return [];
 return findings.map(f=>{
  if(!f||typeof f!=='object'||!Array.isArray(f.citations))throw Error('INVALID_FINDING');
  return {...f,citationChecks:f.citations.map(c=>({...(c&&typeof c==='object'?c:{}),verification:verifyCitation(documents,c)}))};
 });
}
