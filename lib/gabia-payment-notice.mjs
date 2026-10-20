// Gateway events must be verified by the selected provider adapter before reaching the ledger.
export function normalizePaymentNotice(notice,{verified=false}={}){
 if(verified!==true)throw Error('PAYMENT_SIGNATURE_UNVERIFIED');
 if(!notice||typeof notice!=='object'||!['paid','cancelled','refunded'].includes(notice.status)||
 typeof notice.providerTransactionId!=='string'||notice.providerTransactionId.length<8||
 !Number.isSafeInteger(notice.amount)||notice.amount<=0)throw Error('INVALID_PAYMENT_NOTICE');
 return {status:notice.status,providerTransactionId:notice.providerTransactionId,amount:notice.amount};
}
export function paymentNoticeReference(notice){
 return notice.providerTransactionId+':'+notice.status;
}
