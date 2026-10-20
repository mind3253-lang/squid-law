# VERCEL ZERO — 네이버 로그인 이관 점검

## 확인된 현행 코드
- `api/auth/naver/start.js`: 네이버 OAuth 인증 URL로 리디렉션하며, `SQUIDLAW_PUBLIC_ORIGIN`과 `NAVER_CLIENT_ID`를 사용한다.
- `api/auth/naver/callback.js`: OAuth state 쿠키를 검증하고 네이버 토큰·프로필을 조회한다.
- callback은 회원 레코드를 `@vercel/blob`의 private `get`/`put`으로 `squidlaw/users/<sha256>.json`에 저장한다.
- 세션 쿠키는 `SQUID_AUTH_SECRET` HMAC으로 서명한다.
- `api/skynet-chat.js`도 `@vercel/blob`의 private `get`을 사용한다.

## 가비아 전환 전 필수 조건
1. Blob 회원 레코드 전체 백업과 개수·해시 검증.
2. 회원 ID, providerHash, createdAt 유지하는 새 저장소 구축.
3. 동일 계정 재로그인 및 기존 세션 호환성 시험.
4. 네이버 개발자 콘솔 redirect URI와 실제 HTTPS 도메인 확인.
5. 로그인 실패·중복 등록·롤백 시험.

## 주의
고객 데이터 이동, 운영 DNS 변경, Vercel 비활성화는 아직 수행하지 않았다. 로그인 시작 라우트만 가비아로 옮기면 callback이 Blob에 의존하므로 독립화 완료가 아니다.
