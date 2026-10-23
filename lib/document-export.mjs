import {zipSync,strToU8} from 'fflate';

// Shared, format-independent document model. Renderers must never invent case facts.
export function normalizeDocument({title='법률 분석 보고서',text='',metadata={}}={}){
 if(typeof text!=='string'||!text.trim())throw Error('EMPTY_DOCUMENT');
 if(text.length>4_000_000)throw Error('DOCUMENT_TOO_LARGE');
 const paragraphs=text.replace(/\r\n?/g,'\n').split('\n').map(value=>({type:'paragraph',text:value}));
 return {title:String(title).slice(0,200),paragraphs,metadata};
}
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const zip=files=>Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),{level:0}));
const contentTypes=(types)=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+types+'</Types>';
const fontSerif='KoPub Batang';
const fontSans='Noto Sans KR';
const mm=n=>Math.round(n*1440/25.4);
const paraKind=(value)=>/^\\s*\\d+\\.\\s+/.test(value)?'major':/^\\s*\\d+\\)\\s+/.test(value)?'minor':'body';
export function renderDocx(doc){
 const run=(value,kind='body')=>{const heading=kind!=='body',size=kind==='major'?28:kind==='minor'?26:24;return '<w:r><w:rPr><w:rFonts w:eastAsia="'+fontSerif+'" w:ascii="'+fontSerif+'" w:hAnsi="'+fontSerif+'"/>'+(kind==='major'?'<w:b/>':'')+'<w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/></w:rPr><w:t xml:space="preserve">'+xml(value)+'</w:t></w:r>'};
 const p=doc.paragraphs.map(({text})=>{const kind=paraKind(text);return '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr>'+run(text,kind)+'</w:p>'}).join('');
 const body='<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+run(doc.title,'major')+'</w:p>'+p;
 const footer='<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="'+fontSans+'"/><w:sz w:val="20"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
 return zip({
 '[Content_Types].xml':contentTypes('<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'),
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
 'word/footer1.xml':footer,
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="'+mm(20)+'" w:right="'+mm(30)+'" w:bottom="'+mm(15)+'" w:left="'+mm(30)+'" w:header="'+mm(15)+'" w:footer="'+mm(15)+'" w:gutter="0"/></w:sectPr></w:body></w:document>'
 });
}
// Browser PDF rendering uses installed Korean system fonts and the native print-to-PDF
// engine; no loss of Hangul glyphs through a Latin-only PDF font.
export function renderPrintHtml(doc){
 const body=doc.paragraphs.map(p=>{const kind=paraKind(p.text);return '<p class="'+kind+'">'+xml(p.text||'\\u00a0')+'</p>'}).join('');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>'+xml(doc.title)+'</title><style>@page{size:A4;margin:20mm 30mm 15mm}body{font:300 12pt/2 "KoPub Batang","KoPubBatang","Batang",serif;color:#111;text-align:justify}h1{font-size:14pt;font-weight:700;text-align:center;margin:0 0 20pt}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;text-align:justify}p.major{font-size:14pt;font-weight:700}p.minor{font-size:13pt;font-weight:500}table,th,td,figcaption,.footnote{font-family:"Noto Sans KR","Malgun Gothic",sans-serif;font-size:10.5pt}th{text-align:center}td,.footnote{text-align:justify}.footnote{font-size:10pt}.footnote:before{content:"";display:block;width:5cm;border-top:.12mm solid #000;margin:3mm 0}footer{font:10pt "Noto Sans KR","Malgun Gothic",sans-serif;text-align:center}button{position:fixed;right:20px;top:20px;padding:12px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">PDF로 저장 / 인쇄</button><h1>'+xml(doc.title)+'</h1>'+body+'</body></html>';
}
