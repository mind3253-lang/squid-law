# 1차: Vercel/Neon 이전 잔재 정리 — 조사 기록 (2026-10-24)

## 확인된 사항
- 운영 배포는 `.github/workflows/gabia-code-deploy.yml`에서 가비아 서버로 직접 전송·재시작한다.
- `deploy/gabia-integration-audit.mjs`는 런타임 JS/MJS/JSON/HTML/service에서 `vercel.com`, `vercel.app`, `@vercel/blob`, `neon.tech`, `DATABASE_URL_NEON` 문자열을 검색한다. **이 검사는 전체 코드의 모든 간접 의존성을 입증하지 못한다.**
- 해당 검사는 `docs/`, `tests/`, `.github/`, `deploy/`, `scripts/` 경로를 제외한다. 해당 경로는 호출·운영 여부 확인 전 삭제하지 않는다.
- GitHub 코드 검색 API는 이번 조사에서 결과가 불완전(`incomplete_results=true`)해 0건을 근거로 잔재가 없다고 판정하지 않는다.
- `lib/skynet-job-migration.mjs`의 `POSTGRES_URL`은 PostgreSQL 접속 변수일 뿐 Neon 의존성이라는 증거가 아니다.
- `lib/gabia-cutover-guard.mjs`, `lib/gabia-cutover-plan.mjs`, `deploy/CUTOVER_CHECKLIST.md`는 이전·점검 관련 코드와 문서다. 현재 운영에서 미사용이라고 단정할 수 없으므로 보류한다.

## 삭제 판정 규칙
1. 운영 진입점(API/worker/systemd/GitHub Actions/정적 페이지)에서 역방향 호출 관계 확인.
2. 삭제 대상에 고객 데이터, DB 스키마, 객체 스토리지, 결제, 복구·롤백 경로가 연결되어 있으면 보류.
3. 삭제 전후에 분석·SKYNET·문서 출력·가비아 배포 회귀검사 비교.
4. `POSTGRES_URL`처럼 공급자와 무관한 변수는 이름만으로 제거하지 않는다.

## 남은 1차 검증
- 저장소의 전체 텍스트 검색으로 과거 도메인·SDK·환경변수 및 간접 import 확인.
- 실제 가비아 systemd/환경변수의 **키 이름만** 점검하고, 비밀값은 출력하지 않는다.
- 운영에서 참조되지 않는 이사 전용 스크립트/문서를 식별해 보관 또는 제거.
- 운영 호출 관계가 확인되지 않은 항목은 삭제 보류로 명시.

## 완료 판정
위 전체 조사와 필요한 삭제가 끝나고 운영 경로의 구형 공급자 의존성이 없음을 확인하기 전에는 **1차 완료로 보고하지 않는다**.
