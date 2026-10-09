// Conservative, explainable project labels. Never infer a case from a generic person's name.
const cases=[
{id:'case:minji',label:'민지 임대차',numbers:['2025가단106782'],markers:[/민지.{0,20}(임대차|mou|계약)/i,/임대차.{0,20}민지/i]},
{id:'case:bauer',label:'바우어',numbers:[],markers:[/바우어|bauer/i]},
{id:'case:jo-hyejeong',label:'조혜정',numbers:[],markers:[/조혜정/]},
{id:'project:submarine',label:'서브마린',numbers:[],markers:[/서브마린|프리다이빙|다이빙풀/i]},
{id:'project:sihwaseong',label:'시화성',numbers:[],markers:[/시화성|삼선간짜장/]},
{id:'project:squidlaw',label:'SQUIDLAW',numbers:[],markers:[/squid.?law|스퀴드로|skynet|스카이넷/i]}
];
const caseNumbers=s=>[...new Set((String(s||'').match(/20\d{2}\s*(?:가단|가합|나|다|카단|카합|금)\s*\d+/g)||[]).map(x=>x.replace(/\s+/g,'')))];
export function classifyRecord(content,{title='',category=''}={}){const text=String(content||''),header=String(title||'')+' '+String(category||'');const nums=caseNumbers(text+' '+header);const matches=cases.filter(c=>c.numbers.some(n=>nums.includes(n))||c.markers.some(rx=>rx.test(text)||rx.test(header)));if(nums.length){const known=cases.filter(c=>c.numbers.some(n=>nums.includes(n)));if(known.length===1&&matches.length===1)return {id:known[0].id,label:known[0].label,confidence:'high',caseNumbers:nums};return {id:null,label:'미분류',confidence:'uncertain',caseNumbers:nums,candidates:matches.map(x=>x.id)}}if(matches.length===1)return {id:matches[0].id,label:matches[0].label,confidence:'medium',caseNumbers:[]};return {id:null,label:'미분류',confidence:matches.length?'uncertain':'none',caseNumbers:[],candidates:matches.map(x=>x.id)}}
export function queryScope(query){const text=String(query||'');const matches=cases.filter(c=>c.numbers.some(n=>text.includes(n))||c.markers.some(rx=>rx.test(text)));const comparison=/비교|차이|공통|각각|모두|대조/.test(text);return {ids:matches.map(x=>x.id),strict:matches.length===1&&!comparison,comparison}}
export function filterCaseResults(results,query){const scope=queryScope(query);if(!scope.strict)return results;const id=scope.ids[0];return results.filter(x=>x.case?.id===id||x.case?.id==null).sort((a,b)=>Number(b.case?.id===id)-Number(a.case?.id===id))}
