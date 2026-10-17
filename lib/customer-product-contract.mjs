/**
 * SQUIDLAW customer-facing product invariants. Owner-approved decisions,
 * not defaults an assistant may change when a server hits a timeout.
 *
 * Operational size/time limits belong INSIDE staged extraction/workers.
 * They must not silently turn into customer-facing document size tiers.
 */
export const CUSTOMER_PRODUCT_CONTRACT=Object.freeze({
 analysisConcurrency:1,
 billingUnit:'estimated_then_metered_api_usage',
 submission:'one_customer_action_for_entire_case',
 queue:'global_fifo_with_position_and_estimated_wait',
 execution:'durable_checkpoints_with_retry_and_resume',
 customerFileSizeTier:'not_a_pricing_or_product_boundary'
});

export function customerProcessingPolicy(){
 return CUSTOMER_PRODUCT_CONTRACT;
}

/**
 * Persistent system guidance for the SKYNET admin developer dialogue.
 * Product decisions must survive a new conversation or an empty memory search.
 * Applies to development discussions, NOT legal evidence interpretation.
 */
export function customerProductDirective(){
 return '[SQUIDLAW 사용자 확정 제품 설계 · 새 대화에서도 변경 금지] '+
  '고객은 한 번의 제출 동작으로 소송사건 전체 원본을 올린다. '+ 
  '요금은 페이지 수가 아닌 접수 시 보수적 API 예상 사용량을 최소 과금 기준으로 삼고, 확인된 초과 사용량을 추가 정산한다. MB/GB를 고객 상품 등급으로 삼지 않는다. '+
  '법률 분석은 전체 서비스에서 고객 1건씩 직렬 실행하고 나머지는 대기열에 넣어 순번과 예상 대기시간을 보여준다. '+
  '서버 내부에서는 분할 저장, 페이지 단위 처리, 체크포인트, 실패 후 재개를 사용한다. '+
  '기술적 크기/시간/메모리 제한을 임의로 25MB에서 100MB로 올리는 것만으로 완료라고 보고하지 마라. '+
  '이미 원본이 저장된 파일을 다시 업로드하도록 요구하지 마라. '+
  '관리자 SKYNET PDF는 구간 처리로 전환했지만 실제 대용량 원본 검증과 고객 분석 경로의 구조 개선은 남아 있다. '+
  '구현/배포/테스트/운영 검증을 구별하고 완료하지 않은 것을 완료했다고 주장하지 마라. '+
  '법률 판단과 무관한 대화에서는 이 규칙을 불필요하게 반복 설명하지 마라.';
}
