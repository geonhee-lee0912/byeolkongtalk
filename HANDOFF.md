# 메뉴판 진 코드 정리 · 입구 반반 새 흐름 코드 정리

- 마지막 갱신: 2026-11-08 · 자리: 클라우드 세션(Claude) — 브랜치 `claude/blissful-sagan-r13euc` · PR #31(base dev)

## 목표
입구 반반 새 흐름 코드 정리(PR #31) 에 운영자 결정 2건을 더한다.
1. 로그인 경로의 새 흐름 흔적 정리 — 로그인 실패는 항상 홈으로(`lib/auth-redirect.ts`), AuthBootstrap 의 `/tarot/draw` 예외 제거(뽑기 화면 자체 주소 정리도 제거), 애플 버튼 `draw_sheet` 제거
2. ROADMAP 의 "입구 판정 창이 열려 있는 동안은…" 줄 삭제

## 지금 상태
- 코드 정리·리뷰 2회(Codex 지적 없음 · Claude 7건) 끝. 위 2건 작업 시작

## 다음 할 일
- [어디서든] 위 2건 → 타입·테스트·빌드 → 푸시 → `@codex review` 다시 + Claude 리뷰 → HANDOFF 지우고 푸시
- [로컬에서] 실기기: 비로그인 홈 → 고민 → 로그인 → 뽑기 / 로그인 상태 타로 첫 구매 / 카카오 로그인 취소 → 홈

## 확인 못 한 것
- 클라우드라 화면·실로그인 확인 불가

## 건드리면 안 되는 것
- `proxy.ts`·`lib/auth/` 의 세션·가입·웰컴 별 처리 · 알림 쪽(`components/push/`·`app/mypage/notifications`·`lib/push/`)
