import {inflateRawSync, inflateSync} from 'node:zlib';
import * as CFB from 'cfb';
import {unzipSync} from 'fflate';

const LIMIT=12_000_000;
const clean=s=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/ {3,}/g,' ').trim();
function decodeXml(s){return s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(m,n,e)=>e?({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e]):String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)));}
export function extractHwpx(buffer){
 const files=unzipSync(new Uint8Array(buffer));
 const names=Object.keys(files).filter(n=>/^Contents\/section\d+\.xml$/i.test(n)).sort((a,b)=>Number(a.match(/section(\d+)/i)[1])-Number(b.match(/section(\d+)/i)[1]));
 if(!names.length)throw Error('HWPX 본문 섹션이 없습니다');
 let result='';
 for(const name of names){
  const xml=Buffer.from(files[name]).toString('utf8');
  // Keep only paragraph text nodes; never mix style metadata into evidence.
  const paragraphs=xml.match(/<(?:[\w-]+:)?p(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?p>/g)||[];
  for(const p of paragraphs){
   const fragments=[...p.matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)].map(x=>decodeXml(x[1].replace(/<[^>]*>/g,'')));
   if(fragments.length)result+=fragments.join('')+'\n';
   if(result.length>LIMIT)throw Error('HWPX 추출 텍스트 제한 초과');
  }
 }
 if(!result.trim())throw Error('HWPX에서 본문 텍스트를 추출하지 못했습니다');
 return clean(result);
}
export function extractHwp(buffer){
 const cfb=CFB.read(buffer,{type:'buffer'});
 const header=CFB.find(cfb,'FileHeader');
 if(!header?.content)throw Error('HWP 파일 헤더를 찾지 못했습니다');
 const compressed=(header.content[36]&1)!==0;
 const sections=cfb.FileIndex.filter(x=>/\/?BodyText\/Section\d+$/i.test(x.name||'')).sort((a,b)=>Number(a.name.match(/Section(\d+)/i)[1])-Number(b.name.match(/Section(\d+)/i)[1]));
 if(!sections.length)throw Error('HWP 본문 섹션을 찾지 못했습니다 (암호화 문서는 지원되지 않습니다)');
 let output='';
 for(const section of sections){
  let data=Buffer.from(section.content||[]);
  if(compressed){try{data=inflateRawSync(data,{maxOutputLength:LIMIT})}catch{data=inflateSync(data,{maxOutputLength:LIMIT})}}
  let pos=0;
  while(pos+4<=data.length){
   const head=data.readUInt32LE(pos);pos+=4;
   const tag=head&1023;
   let size=(head>>>20)&4095;
   if(size===4095){if(pos+4>data.length)break;size=data.readUInt32LE(pos);pos+=4}
   if(size>data.length-pos)break;
   if(tag===67&&size>0){
    const raw=data.subarray(pos,pos+size);
    // HWP paragraph text contains embedded control characters.
    const value=raw.toString('utf16le').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ');
    output+=value+'\n';
    if(output.length>LIMIT)throw Error('HWP 추출 텍스트 제한 초과');
   }
   pos+=size;
  }
 }
 if(!output.trim())throw Error('HWP 본문을 읽지 못했습니다 (암호화 또는 미지원 형식)');
 return clean(output);
}
