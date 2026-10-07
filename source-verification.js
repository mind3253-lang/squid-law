// Browser-side source citation verification for future AI findings.
// A citation verifies that a quotation appears in a PDF's extracted text;
// it does NOT verify that the quoted factual assertion is true.
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
export function verifyCitation(documents,citation){
 if(!citation||typeof citation!=='object')return {status:'invalid',reason:'출처 형식 오류'};
 const doc=documents.find(d=>d.name===citation.document);
 if(!doc)return {status:'missing_document',reason:'해당 PDF가 없음'};
 const page=Number(citation.page);
 if(!Number.isInteger(page)||page<1||page>doc.pages.length)return {status:'invalid_page',reason:'페이지 범위 오류'};
 const quote=normalize(citation.quote);
 if(quote.length<8)return {status:'invalid_quote',reason:'원문 인용이 너무 짧음'};
 const source=normalize(doc.pages[page-1]?.text);
 if(!source)return {status:'unreadable_page',reason:'텍스트 추출이 되지 않은 페이지'};
 if(source.includes(quote))return {status:'matched',reason:'PDF 추출 원문에서 인용 문구 확인'};
 return {status:'unmatched',reason:'해당 페이지에서 인용 문구를 찾지 못함'};
}
export function verifyFindings(documents,findings){
 if(!Array.isArray(findings))return [];
 return findings.map(f=>({...f,citationChecks:(Array.isArray(f.citations)?f.citations:[]).map(c=>({...c,verification:verifyCitation(documents,c)}))}));
}
