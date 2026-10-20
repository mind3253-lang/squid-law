# VERCEL ZERO — 1차 (01~03) 실행 기록
작성: 2026-10-20

## 목표
01 Vercel 의존성 전수조사
02 가비아 서버 운영환경 통합
03 홈페이지 이전

## 코드에서 직접 확인한 사항
- `vercel.json`은 다수의 `/admin/*` 경로를 `/api/*`로 rewrite한다.
- `vercel.json`의 installCommand가 테스트와 DB migration을 실행한다. 가비아 배포 절차에 별도 반영해야 한다.
- `vercel.json`에는 customer-analysis-worker 5분 주기 cron 및 skynet-search-backfill 10분 주기 cron이 있다.
- `worker/continuous-worker.mjs`는 독립 Node 프로세스이지만 `api/customer-analysis-worker.js`를 직접 import한다.
- `api/customer-analysis-worker.js`는 `@vercel/blob`의 get/list/put에 의존한다.
- `lib/customer-worker-dispatch.mjs`는 `@vercel/functions`의 waitUntil 및 Vercel 호스트 호출에 의존한다.
- `lib/customer-worker-owner.mjs`는 기본 작업 소유자를 vercel로 취급하며 gabia로 바꾸려면 명시적 설정이 필요하다.
- `api/customer-analysis-jobs-db.js`는 PostgreSQL advisory lock, lease, fencing token으로 전역 1개 분석 작업을 보장한다.

## 서버에서 사용자와 확인된 사실
- 가비아 서버에서 OpenAI /v1/models HTTP 200 응답 확인.
- squidlaw-worker systemd 서비스 설치.
- 최근 로그의 WORKER_CUTOVER_NOT_APPROVED로 프로세스 종료. 실제 고객 분석 성공은 미확인.
- 서버의 CRON_SECRET, BLOB_READ_WRITE_TOKEN, PostgreSQL 연결 값 존재 여부 미확인.

## 01 전수조사 — 남은 검사
- 모든 `@vercel/*` import, VERCEL_* 변수, blob URL, cron, rewrite, 함수별 런타임 의존성 검색
- 정적 자산/SPA 라우팅, 로그인, 결제, 업로드, 보고서 다운로드, SKYNET API 목록화
- Blob 저장물의 객체 수/용량/접근권한/무결성 목록화(고객 파일 내용 로그 금지)
- Vercel 환경변수와 GitHub Secrets의 키 이름만 비교(값 노출 금지)
- 현재 DNS/SSL/프록시 경로 확인

## 02 가비아 통합 — 남은 작업
- Node API 서버와 정적 웹 서빙을 동일 origin으로 구성
- nginx TLS/리버스프록시, systemd 서비스, health endpoint, 재시작 정책
- PostgreSQL/스토리지/백업/로그/보안 환경변수 분리
- 작업 소유권 단일화와 비용 발생 전 승인 유지

## 03 홈페이지 이전 — 남은 작업
- 기존 프런트 빌드/정적 리소스 배포
- /admin rewrite를 가비아 라우팅으로 치환
- 로그인/세션/쿠키/업로드/관리자 접근 동작 검증
- DNS 변경 전 가비아 staging 호스트에서 점검

## 일괄 전환 규칙
- 사용자 요청: 총 15개 항목을 3개씩 5차 진행, Vercel 완전 제거.
- 단계별로 준비하되, 운영 도메인 전환은 한 번에 수행.
- 기존 고객 데이터 삭제, Vercel 서비스 중단, 결제/고객 작업 실행은 검증 전 금지.
- 커밋 또는 systemd active는 완료 증거가 아님. 실제 E2E 성공으로 완료 판정.

## 현재 판정
01 부분 조사 / 02 부분 구축 / 03 미완료.
