import hwpxBaseTemplate from './hwpx-base-template.mjs';
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
export function renderDocx(doc){
 const p=doc.paragraphs.map(({text})=>'<w:p><w:pPr><w:spacing w:after="120" w:line="160" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="Malgun Gothic" w:ascii="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">'+xml(text)+'</w:t></w:r></w:p>').join('');
 const body='<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>'+xml(doc.title)+'</w:t></w:r></w:p>'+p;
 return zip({
 '[Content_Types].xml':contentTypes('<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'),
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>'
 });
}
// Browser PDF rendering uses installed Korean system fonts and the native print-to-PDF
// engine; no loss of Hangul glyphs through a Latin-only PDF font.
export function renderPrintHtml(doc){
 const body=doc.paragraphs.map(p=>'<p>'+xml(p.text||'\u00a0')+'</p>').join('');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>'+xml(doc.title)+'</title><style>@page{size:A4;margin:25mm}body{font:11pt/1.65 "Malgun Gothic","Noto Sans KR",sans-serif;color:#111}h1{text-align:center;font-size:17pt;margin:0 0 24pt}p{margin:0 0 6pt;white-space:pre-wrap;overflow-wrap:anywhere}button{position:fixed;right:20px;top:20px;padding:12px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">PDF로 저장 / 인쇄</button><h1>'+xml(doc.title)+'</h1>'+body+'</body></html>';
}

export function renderHwpx(doc){
 // Start with an actual HWPX package template rather than synthesizing a
 // partial HWPML package. Preserve its full header, metadata and relationships.
 const files=Object.fromEntries(Object.entries(hwpxBaseTemplate).map(([path,b64])=>[path,new Uint8Array(Buffer.from(b64,'base64'))]));
 const original=Buffer.from(files['Contents/section0.xml']).toString('utf8');
 const first=original.match(/<hp:p\\b[\\s\\S]*?<\\/hp:p>/);
 const opening=original.match(/^([\\s\\S]*?<hs:sec\\b[^>]*>)/);
 if(!first||!opening||!original.includes('</hs:sec>'))throw Error('HWPX_TEMPLATE_INVALID');
 const p=(value,i)=>'<hp:p id="'+(i+100)+'" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>'+xml(value)+'</hp:t></hp:run></hp:p>';
 const body=[doc.title,...doc.paragraphs.map(x=>x.text)].map(p).join('');
 const section=opening[1]+first[0]+body+'</hs:sec>';
 files['Contents/section0.xml']=strToU8(section);
 files['Preview/PrvText.txt']=strToU8([doc.title,...doc.paragraphs.map(x=>x.text)].join('\\n').slice(0,8192));
 return Buffer.from(zipSync(files,{level:0}));
}
