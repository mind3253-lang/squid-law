import {Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign, Footer, PageNumber, HeadingLevel, ShadingType} from 'docx';

const serif='KoPub Batang', sans='Noto Sans KR';
const mm=n=>Math.round(n*1440/25.4);
const kind=s=>/^\s*(?:#{1,2}\s+|\d+\.\s+)/.test(s)?'major':/^\s*(?:#{3,6}\s+|\d+\)\s+)/.test(s)?'minor':'body';
const display=(s,k)=>k==='body'?s:s.replace(/^\s*#{1,6}\s+/,'');
const pipe=s=>/^\|.*\|$/.test(s.trim())?s.trim().slice(1,-1).split('|').map(x=>x.trim()):null;
const separator=s=>{const r=pipe(s);return !!r&&r.every(x=>/^:?-{3,}:?$/.test(x))};
const clean=s=>String(s||'').replace(/[·•‧∙⋅]/g,'').replace(/_+/g,' ').replace(/\s+/g,' ').trim();
function blocks(doc){const out=[],p=doc.paragraphs;for(let i=0;i<p.length;){const h=pipe(p[i].text);if(h&&i+1<p.length&&separator(p[i+1].text)){i+=2;const rows=[];while(i<p.length){const row=pipe(p[i].text);if(!row||row.length!==h.length)break;rows.push(row);i++}out.push({type:'table',header:h,rows});continue}out.push({type:'paragraph',text:p[i].text});i++}return out}
function paragraph(value,k='body',center=false){const size=k==='major'?28:k==='minor'||value.startsWith('1) ')||value.startsWith('2) ')||value.startsWith('3) ')||value.startsWith('4) ')?26:24;return new Paragraph({alignment:center||value.startsWith('본 분석자료는')||value.startsWith('모든 주관은')||value.startsWith('치우쳐지지 않은')||value.startsWith('그것이 나홀로')||value.startsWith('변호사에게 자문을')||value.startsWith('스키드로우는 분석')||value.startsWith('자세한 사항은')?AlignmentType.CENTER:AlignmentType.JUSTIFIED,indent:value.startsWith('①')||value.startsWith('②')||value.startsWith('③')||value.startsWith('④')||value.startsWith('⑤')||value.startsWith('⑥')||value.startsWith('⑦')||value.startsWith('⑧')||value.startsWith('⑨')||value.startsWith('⑩')?{left:mm(5),hanging:mm(5)}:k==='body'?{firstLine:mm(5)}:undefined,spacing:{before:0,after:0,line:432,lineRule:'auto'},children:[new TextRun({text:display(value,k),font:serif,size,bold:k==='major'})]})}
const borders=Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(k=>[k,{style:BorderStyle.SINGLE,size:5,color:'000000'}]));
function makeTable(block){
 const issue=block.header.length===3&&block.header[0]==='핵심 쟁점';
 const widths=issue?[1800,1800,5400]:block.header.map(()=>Math.floor(9000/block.header.length));
 const cell=(value,j,header=false,merge)=>new TableCell({width:{size:widths[j],type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:header?{type:ShadingType.CLEAR,fill:'EDEDED'}:undefined,verticalMerge:merge,children:[new Paragraph({alignment:header||(issue&&j<2)?AlignmentType.CENTER:AlignmentType.JUSTIFIED,spacing:{line:300,lineRule:'auto'},children:[new TextRun({text:header?value:issue?clean(value):value,font:sans,size:21})]})]});
 const rows=[new TableRow({children:block.header.map((v,j)=>cell(v,j,true))})];
 for(let i=0;i<block.rows.length;i++){const row=block.rows[i];rows.push(new TableRow({children:row.map((v,j)=>{let merge;if(issue&&j===0){if(v&&i+1<block.rows.length&&!block.rows[i+1][0])merge='restart';else if(!v)merge='continue'}return cell(v,j,false,merge)})}))}
 return new Table({rows,width:{size:9000,type:WidthType.DXA},columnWidths:widths,borders});
}
const introStart=s=>s.startsWith('본 분석자료는');
const introLine=s=>['본 분석자료는','모든 주관은','치우쳐지지 않은','그것이 나홀로','변호사에게 자문을'].some(t=>s.startsWith(t));
const closingLine=s=>s.startsWith('스키드로우는 분석');
function framed(lines){
 return new Table({width:{size:9000,type:WidthType.DXA},columnWidths:[9000],borders:{top:{style:BorderStyle.SINGLE,size:6,color:'000000'},bottom:{style:BorderStyle.SINGLE,size:6,color:'000000'},left:{style:BorderStyle.SINGLE,size:6,color:'000000'},right:{style:BorderStyle.SINGLE,size:6,color:'000000'}},rows:[new TableRow({children:[new TableCell({width:{size:9000,type:WidthType.DXA},children:lines.map(t=>new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:0,after:0,line:432,lineRule:'auto'},children:[new TextRun({text:t,font:sans,size:22})]}))})]})]});
}
function formattedBlocks(doc){
 const items=blocks(doc),out=[];
 for(let i=0;i<items.length;i++){
  const b=items[i];
  if(b.type==='paragraph'&&introStart(b.text)){
   const lines=[b.text];let j=i+1;
   while(j<items.length&&items[j].type==='paragraph'&&(!items[j].text.trim()||introLine(items[j].text))){if(items[j].text.trim())lines.push(items[j].text);j++}
   out.push(framed(lines));i=j-1;continue;
  }
  if(b.type==='paragraph'&&closingLine(b.text)){out.push(framed([b.text]));continue}
  out.push(b.type==='table'?makeTable(b):paragraph(b.text,kind(b.text)));
 }
 return out;
}
export async function renderDocxStandard(doc){
 const children=[paragraph(doc.title,'major',true),...formattedBlocks(doc)];
 const footer=new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],font:sans,size:20})]})]});
 const file=new Document({creator:'SQUID LAW',title:doc.title,styles:{default:{document:{run:{font:serif,size:24},paragraph:{spacing:{line:432}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:mm(15),right:mm(30),bottom:mm(15),left:mm(30),header:mm(5),footer:mm(0)}}},footers:{default:footer},children}]});
 return Buffer.from(await Packer.toBuffer(file));
}
