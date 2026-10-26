# SQUIDLAW 동일 자료 검산: 2분 59초 → 약 7분 회귀 분석 (2026-10-27)

## 사용자 관측 (확정)
- 이전 검산: 동일한 '고소장 조혜정.pdf' 보고서 생성 약 2분 59초, 진행률 52% 정체.
- 이번 검산: 같은 자료로 보고서 약 7분, 진행 그래프 일시 미표시 및 52% 정체, 사용자 관측 API 비용 약 $3.
- 약 420/179=2.35배 소요. 7분은 근삿값이므로 정확한 배율은 서버 타임스탬프로 재산정.
- 새 보고서에서는 문장 절단·장별 중복은 개선되었지만 당사자 주장 분류는 실패.
- 보고서 생성 시각만으로 모델 실행 지연·서버 대기·재시도를 단정하지 않는다.

## 코드 비교 (GitHub 확인)
- 비교 기준: f797876d1e42c7323945dacc23971e94cc111107 → 609f6bff97f18f96270830e58e94aeb230283923 (18 commits ahead).
- compare_commits의 변경 파일 중 분석 본체 관련 변경은 lib/customer-analysis-brief.mjs(14줄 추가, 10줄 삭제), customer.html(2줄 추가, 6줄 삭제), 배포 워크플로와 결과 JSON.
- 이 비교 구간에는 api/customer-analysis-worker.js, lib/gpt-legal-orchestrator.mjs, lib/openai-vision-provider.mjs 변경이 표시되지 않는다. 즉 이번 회귀를 'PDF 중복 호출 로직이 새로 추가돼서'라고 설명할 근거는 없다.
- customer-analysis-brief.mjs는 최종 결과 포맷터이므로 이 변경만으로 4분 추가 모델 실행을 설명하기 어렵다. 실제 서비스 배포 버전과 작업 시작 당시 버전을 반드시 대조한다.
- 법률 엔진은 소스 창별 GPT 호출을 실행하며, 각 창 최대 64,000자. PDF vision primary와 독립 audit도 별도 GPT 호출 가능.
- SQUIDLAW_ANALYSIS_TIMING=1일 때만 ANALYSIS_TIMING 로그가 남는다. 모델별 SQUIDLAW_MODEL_USAGE 로그도 존재.
- 52%는 UI 계산식에서 자료 수집 완료 + 분석 작업 시작(legalTaskIndex=0) 시 나타날 수 있는 정체 수치. GPT 지연 자체의 증거는 아니다.

## 수정 대기 목록 (아직 미적용)
1. 텍스트 PDF에도 불필요하게 PDF vision primary/audit를 중복 실행하는지 검사. 증거 무결성 보장은 유지하며 필요 없는 모델 반복 판독만 제거.
2. 동일 소스 창의 중복 전송/재시도/재호출 여부 검사.
3. 모델 호출 횟수, 모델명, 호출별 input/output 토큰, 단계별 실행시간, 재시도 횟수를 개인자료·키 없이 집계.
4. 52% 정체를 실제 단계 정보로 표시하고 그래프 숨김 조건 재검토.
5. 출력 문장 완결성·중복 개선은 유지. 임의 토큰 제한이나 검증 단계 무작정 제거 금지.

## 이전/이번 직접 비교에 필요한 증거
- 두 jobId의 createdAt, startedAt, completedAt, checkpoint 타임스탬프, 단계별 ANALYSIS_TIMING.
- 두 작업의 SQUIDLAW_MODEL_USAGE, vision/법률 호출별 ledger, retry 카운트, 사용 모델.
- 작업 실행 중 가비아에 실제 반영된 코드 SHA와 worker 재시작 시각.
- 각 단계 PDF 추출/시각 검증/법률 추론/완료 검증의 소요시간을 2개 작업별로 나란히 비교.
- 차이(초)와 총 증가분에 대한 기여도를 계산한 뒤에만 원인 확정.

## 운영 원칙
- 분석 실행 중인 고객 작업을 취소하거나 재업로드하지 않는다.
- 비교 원인 확인 전 무작정 코드 최적화/토큰 상한 축소/검증 삭제 금지.
- GitHub commit과 가비아 서버 실제 반영은 별개로 검증한다.
