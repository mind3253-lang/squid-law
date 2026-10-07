// SQUID LAW AI analysis endpoint: intentionally locked until authenticated access and billing are implemented.
// Never expose model credentials in client code or accept arbitrary public AI proxy requests.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 const length=Number(req.headers['content-length']||0);
 if(length>128*1024)return res.status(413).json({error:'REQUEST_TOO_LARGE'});
 return res.status(503).json({
  error:'ANALYSIS_NOT_ENABLED',
  message:'AI 분석은 사용자 인증, 결제 확인, 요청량 제한, 개인정보 처리 정책과 서버 API 키 설정 후 제공됩니다.',
  dataUploaded:false
 });
}
