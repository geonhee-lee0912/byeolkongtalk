# 메뉴판 진 코드 정리 · 입구 반반 새 흐름 코드 정리

- 마지막 갱신: 2026-11-08 · 자리: 클라우드 세션(Claude) — 브랜치 `claude/blissful-sagan-r13euc`
- 기준: `origin/claude/entry-old`(입구 스위치 `ENTRY_AB="old"` 고정 PR) 위. PR base 는 `dev`

## 목표
입구 반반 판정(2026-11-07, 옛 흐름 고정)으로 죽은 코드가 된 새 흐름(로그인 전 맛보기) 전용 코드와
메뉴판 반반의 남은 진 코드(`lib/tarot/menu-ab.ts`·`TarotSpreadSelection.consented`)를 걷어낸다. 옛 흐름 동작은 그대로.

## 지금 상태
- 지울 범위 조사 끝. 코드 수정 시작 전

## 다음 할 일
- [어디서든] 홈·고민 쓰기·/tarot·뽑기 화면·지갑·마이페이지에서 새 흐름 분기 제거 → 타입·테스트·빌드 → PR(base dev) → 리뷰 2회
- [로컬에서] 실기기 확인: 비로그인 홈 → 고민 → 로그인 → 돌아와 뽑기 / 로그인 상태 타로 첫 구매

## 확인 못 한 것
- 클라우드라 화면 확인 불가

## 건드리면 안 되는 것
- `proxy.ts`·`components/auth/AuthBootstrap.tsx`·`lib/auth/`·`lib/auth-redirect.ts`(애플 로그인·앱 핸드오프도 씀)
- 알림 쪽(`components/push/`·`app/mypage/notifications`·`lib/push/`) — 다른 세션이 작업 중
- 판정 기록: `scripts/entry-ab-*.sql`·`scripts/ab-bootstrap.mjs`·설계·계획 문서·계측 이벤트 이름 정의
