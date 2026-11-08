# 앱 화면 전체 손보기

- 마지막 갱신: 2026-11-08 밤 · 자리: 로컬(운영자 PC, Claude Code) — 오늘 멈춤, 내일 같은 자리에서 이어감
- 목표: 앱 화면 손보기 4단계 — 앱 쪽 묶음(ui 메시지·안드로이드 뒤로 버튼으로 시트 닫기·진동·당겨서 새로고침·링크 미리보기 끔·아이콘). 빌드는 디자인 다듬기 뒤 1회. 계획 `docs/superpowers/plans/2026-11-08-앱-화면-4-앱쪽묶음.md`, 스펙 `docs/superpowers/specs/2026-11-07-앱-화면-design.md` §5·§7·§8·§10
- 지금 상태:
  - 이 브랜치는 `claude/app-screens-3`(PR #39 — Codex 리뷰 "큰 문제 없음", 운영자 머지 대기) 위에 쌓았다. #39 가 dev 에 머지된 뒤 PR(base dev)을 연다
  - 계획 Task 1~5 커밋 완료: 메시지 규약(ui.overlay·ui.back·ui.haptic·ui.refresh, caps ui, APP_TAB_ROOTS) · 겹창 스택↔앱 다리(z 가장 높은 창을 닫음) · 진동 요청 3곳 · 안드로이드 당김 표시 · 앱 WebScreen 받기(뒤로 버튼·새로고침·iOS 당김·링크 미리보기 끔)
  - 검사: 타입(웹·앱) 0 · 테스트 1960/1960 · 빌드 성공 + `ƒ Proxy`
  - 헤드리스(앱 흉내) 확인 완료: 뒤로 버튼 신호·닫을 수 없는 창 소비·옛 앱 무신호·탭 진동·당겨서 새로고침
  - 최종 리뷰(새 문맥)를 돌리던 중 멈춤 — 결과를 못 받았으면 다시 돌린다
- 다음 할 일:
  1. [로컬에서] 최종 리뷰 — 결과가 없으면 리뷰 묶음을 다시 만들어(`01aae4db..HEAD`) 다시 맡긴다. Critical·Important 만 고친다(재현 → 고침 → 재확인)
  2. [로컬에서, 운영자] `cd mobile && npx expo install expo-haptics` — 설치되면 `WebScreen.tsx` 의 `ui.haptic` 자리에 진동을 붙인다(light = impactAsync Light, success = notificationAsync Success)
  3. [운영자 결정] 앱 아이콘(Task 6) — 생성 전에 대상·스타일·프롬프트 합의. 대상 = `public/byeolkong-head.png` 별콩이 머리, 귀걸이·머리 위 고리 같은 잔장식은 덜어 냄, 배경 night `#1F1735` 계열. 지금 `mobile/assets/icon.png` 은 500px·모서리 투명이라 아이폰 제출에 걸린다. 상태바 아이콘은 이미 규격(96×96 흰 4꼭지 별)이라 그대로 둔다
  4. 아이콘까지 끝나면 HANDOFF 지우고 PR(base dev) + `@codex review`
- 확인 못 한 것: 실기기 전부(다음 빌드) · 기록으로 닫는 시트(보조 카드·별 충전)에 뒤로 버튼 → 주소가 한 칸만 바뀌는지(헤드리스로 그 시트까지 못 감)
- 건드리면 안 되는 것: BRIDGE_VERSION(올리지 말 것) · 옛 메시지의 선 위 모양 · 앱 토큰을 메시지에 싣기 · 운영 배포(앱 출시 때)
