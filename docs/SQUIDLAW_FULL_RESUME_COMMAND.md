# SQUIDLAW 전체 법률 엔진 — 재개 실행 명령

## 제품 확정 원칙 (다음 방에서 첫 번째로 확인할 것)
먼저 `AGENTS.md` 제4절과 `lib/customer-product-contract.mjs`를 읽는다.
**사건 전체 한 번에 업로드, 페이지당 과금, 전체 고객 분석 동시 실행 1건,
순서/예상 대기시간 표시, 분할·체크포인트·재개**는 이미 확정된 설계다.
25MB→100MB 같은 내부 파일 제한 숫자 변경만으로 이 문제를 해결했다고
보고하지 않는다. 새 채팅방에서도 이 원칙에 대한 재승인을 묻지 않는다.
`api/customer-analysis-jobs-db.js`의 글로벌 단일 작업 실행권 확인과
`tests/customer-product-contract.test.mjs` 자동검사를 유지한다.
**미완료:** 관리자 SKYNET의 100MB 단일메모리 PDF 추출과 실제 대용량
운영 재현은 아직 구조 개선 및 검증 필요. READY는 통합 처리 성공 증거가 아니다.

## 프로젝트
GitHub: mind3253-lang/squid-law (main)
Vercel: squid-law
작업표: docs/SQUIDLAW_FULL_TASK_MANIFEST.json (41개 고유 ID)
실운영 장애 기록: docs/SQUIDLAW_338PAGE_INCIDENT_AND_RESUME.md
스카이넷 별도 지침: docs/SKYNET_RESUME_COMMAND.md

## 세션 시작 절차
1. 최신 main과 작업표 41개를 읽는다.
2. 상태가 verified이며 현재 코드에도 검증 근거가 유효한 항목만 제외한다.
3. in_progress 항목은 마지막 checkpoint에서 이어간다. implemented는 검증이 필요하다.
4. P0 운영 장애 복구를 우선한다. 이후 P1, P2 순으로 진행한다.
5. 항목별 코드 위치와 수용 기준을 확인한 뒤 조사, 구현, 테스트, 운영 검증을 반복한다.
6. 진행 중 상태, 검증 증거, 마지막 성공 커밋, 다음 액션, 차단 사유를 GitHub 작업표에 갱신한다.
7. 작업 중단 또는 대화방 변경 시 검증 완료 항목은 반복하지 않고 미완료만 이어간다.
8. 새 과제는 LAW-042부터 번호를 추가한다. 기존 작업 번호는 유지한다.

## 338페이지 운영 장애 우선 처리
원문 검증 338/338, 약 70분, text_review_finalize_checkpoint에서 정체, 보고서 미생성, 비JSON 응답 파싱 오류가 보고되었다.
기존 원본·부분 결과·체크포인트를 보존하고 안전하게 조사한다. 기존 처리 결과를 불필요하게 처음부터 재처리하지 않는다.
원문 검증률과 전체 분석 완료율을 분리하고, 보고서 생성·저장·열기를 실제로 확인한다.

## 완료 기준
코드 존재, 커밋, Vercel READY, 모의 테스트는 단독으로 완료 근거가 아니다.
검증 가능한 테스트 및 필요한 운영 증거를 기록해야 verified로 전환한다.
고객 정보와 비밀정보를 노출하지 않는다. 파괴적 변경은 별도 승인받는다.
중간의 사소한 커밋마다 보고하지 말고 작업 완료 또는 실제 차단 시 정리한다.

## 새 방 시작 문장
스키드로우 이어서. GitHub docs/SQUIDLAW_FULL_RESUME_COMMAND.md와 38개 작업표를 읽고, 완료한 건 제외하고 남은 것만 실행해.
