// Customer identity is an explicit intake choice, not a guess from pleadings.
const ROLE_LABELS=Object.freeze({plaintiff:'원고',defendant:'피고'});
export const CUSTOMER_CLIENT_ROLES=ROLE_LABELS;
const field=(x,max,label)=>{
 if(x===undefined||x===null)return '';
 if(typeof x!=='string')throw Error(label+' 형식 오류');
 const value=x.trim();
 if(value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error(label+' 길이 또는 형식 오류');
 return value;
};
export function validClientRole(value){return Object.hasOwn(ROLE_LABELS,value);}
export function requireClientRole(record){
 const side=record?.intake?.clientRole;
 if(!validClientRole(side))throw Error('CLIENT_ROLE_REQUIRED');
 return side;
}
export function normalizeCaseIntake(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!validClientRole(input.clientRole))
  throw Error('원고인가요, 피고인가요? 의뢰인 지위를 먼저 선택해 주세요.');
 if(input.isFiledCase!==undefined&&typeof input.isFiledCase!=='boolean')
  throw Error('접수된 사건인지 선택해 주세요.');
 const result={
  clientRole:input.clientRole,
  isFiledCase:input.isFiledCase===true,
  courtCaseNumber:field(input.courtCaseNumber,90,'사건번호'),
  plaintiffName:field(input.plaintiffName,120,'원고 표시'),
  defendantName:field(input.defendantName,120,'피고 표시'),
  claimRelief:field(input.claimRelief,2800,'청구취지')
 };
 if(result.isFiledCase===false&&result.courtCaseNumber)
  throw Error('법원 사건번호가 있으면 접수된 사건으로 표시해 주세요.');
 return result;
}
export function filedCaseHeadingComplete(record){
 const i=record?.intake;
 if(!i||!validClientRole(i.clientRole))return false;
 if(i.isFiledCase!==true)return true;
 return ['courtCaseNumber','plaintiffName','defendantName','claimRelief']
  .every(key=>typeof i[key]==='string'&&i[key].trim().length>0);
}
export function intakeForReport(record){
 const i=record?.intake;
 if(!i||!validClientRole(i.clientRole))return null;
 return {
  clientRole:i.clientRole,
  clientRoleLabel:ROLE_LABELS[i.clientRole],
  isFiledCase:i.isFiledCase===true,
  courtCaseNumber:typeof i.courtCaseNumber==='string'?i.courtCaseNumber:'',
  plaintiffName:typeof i.plaintiffName==='string'?i.plaintiffName:'',
  defendantName:typeof i.defendantName==='string'?i.defendantName:'',
  claimRelief:typeof i.claimRelief==='string'?i.claimRelief:''
 };
}
