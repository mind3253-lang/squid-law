/**
 * Read contiguous PDF PAGE ranges from immutable indexed source segments.
 * A byte/text segment midpoint is NOT the midpoint of PDF pages.
 * The caller supplies readSegment(index) and a durable manifest count.
 */
export async function seekIndexedPage({segmentCount,readSegment,page}){
 if(!Number.isSafeInteger(segmentCount)||segmentCount<1||
  !Number.isSafeInteger(page)||page<1||typeof readSegment!=='function')
  throw Error('INVALID_PDF_PAGE_SEEK');
 let low=0,high=segmentCount;
 while(low<high){
  const middle=Math.floor((low+high)/2);
  const segment=await readSegment(middle);
  if(!Number.isSafeInteger(segment?.page)||segment.page<1)
   throw Error('INVALID_INDEXED_PDF_PAGE');
  if(segment.page<page)low=middle+1;else high=middle;
 }
 return low;
}
export async function readIndexedPageWindow({
 segmentCount,readSegment,startPage,endPage,offset=null,position=0,limit=30000
}){
 if(!Number.isSafeInteger(segmentCount)||segmentCount<1||
  !Number.isSafeInteger(startPage)||startPage<1||
  !Number.isSafeInteger(endPage)||endPage<startPage||
  !Number.isSafeInteger(position)||position<0||
  !(offset===null||(Number.isSafeInteger(offset)&&offset>=0&&offset<=segmentCount))||
  !Number.isSafeInteger(limit)||limit<500||limit>60000)
  throw Error('INVALID_PDF_PAGE_WINDOW');
 let i=offset===null?await seekIndexedPage({segmentCount,readSegment,page:startPage}):offset;
 if(offset===null&&position!==0)throw Error('INVALID_INITIAL_PAGE_POSITION');
 const initialIndex=i,initialPosition=position;
 let previousPage=0,visited=0,out='';
 const pages=new Set();
 while(i<segmentCount&&visited<20&&out.length<limit){
  const segment=await readSegment(i);
  const page=Number(segment?.page);
  if(!Number.isSafeInteger(page)||page<1||
   typeof segment.text!=='string'||(previousPage&&page<previousPage))
   throw Error('INVALID_INDEXED_PAGE_ORDER_OR_CONTENT');
  if(page<startPage)throw Error('PAGE_CURSOR_BEFORE_WINDOW');
  if(page>endPage)break;
  if(position>segment.text.length)throw Error('PAGE_CURSOR_OUTSIDE_SEGMENT');
  const header='\n[PDF '+page+'쪽 / 구간 '+(segment.part??i)+']\n';
  if(limit-out.length<=header.length+10&&out.length)break;
  const available=Math.max(1,limit-out.length-header.length);
  const count=Math.min(segment.text.length-position,available);
  out+=header+segment.text.slice(position,position+count);
  pages.add(page);previousPage=page;
  position+=count;
  if(position>=segment.text.length){i++;position=0;visited++}
  else break;
 }
 if(i===initialIndex&&position===initialPosition&&i<segmentCount){
  const entry=await readSegment(i);
  if(entry?.page<=endPage)throw Error('PDF_PAGE_WINDOW_STALLED');
 }
 const next=i<segmentCount?await readSegment(i):null;
 const done=i===segmentCount||(next&&next.page>endPage);
 return {text:out,offset:i,position,done:!!done,pages:[...pages].sort((a,b)=>a-b)};
}
