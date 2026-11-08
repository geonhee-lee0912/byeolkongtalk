# 앱 화면 전체 손보기

- 마지막 갱신: 2026-11-08 밤 · 자리: 로컬(운영자 PC, Claude Code) — 오늘 멈춤, 내일 같은 자리에서 이어감
- 목표: 앱 화면 손보기 4단계 — 앱 쪽 묶음(ui 메시지·안드로이드 뒤로 버튼으로 시트 닫기·진동·당겨서 새로고침·링크 미리보기 끔·아이콘). 빌드는 디자인 다듬기 뒤 1회. 계획 `docs/superpowers/plans/2026-11-08-앱-화면-4-앱쪽묶음.md`, 스펙 `docs/superpowers/specs/2026-11-07-앱-화면-design.md` §5·§7·§8·§10
- 지금 상태:
  - 이 브랜치는 `claude/app-screens-3`(PR #39 — Codex 리뷰 "큰 문제 없음", 운영자 머지 대기) 위에 쌓았다. #39 가 dev 에 머지된 뒤 PR(base dev)을 연다
  - 계획 Task 1~5 커밋 완료: 메시지 규약(ui.overlay·ui.back·ui.haptic·ui.refresh, caps ui, APP_TAB_ROOTS) · 겹창 스택↔앱 다리(z 가장 높은 창을 닫음) · 진동 요청 3곳 · 안드로이드 당김 표시 · 앱 WebScreen 받기(뒤로 버튼·새로고침·iOS 당김·링크 미리보기 끔)
  - 검사: 타입(웹·앱) 0 · 테스트 1960/1960 · 빌드 성공 + `ƒ Proxy`
  - 헤드리스(앱 흉내) 확인 완료: 뒤로 버튼 신호·닫을 수 없는 창 소비·옛 앱 무신호·탭 진동·당겨서 새로고침
  - 최종 리뷰(새 문맥, `01aae4db..b6f92360`) 받음 — Critical 0 · Important 1 · Minor 4. 아직 안 고침
- 다음 할 일:
  1. [로컬에서] 최종 리뷰 Important 1 고치기
     - 문제(유력, 라이브러리 원본 코드로 판정): 안드로이드 웹뷰는 `onLoadStart` 를 새 문서뿐 아니라 모든 기록 변경(pushState·replaceState·뒤로)마다 보낸다(`react-native-webview` 14 `RNCWebViewClient.java` doUpdateVisitedHistory). 그런데 `mobile/src/WebScreen.tsx` 는 그때마다 겹창 상태를 닫힘으로 되돌린다. 웹 다리는 0↔1 때만 알리니 다시 안 맞는다
     - 예: 별 확인 시트 위에 별 충전 시트(pushState)가 열리면 → 뒤로 두 번째에 확인창이 열린 채 페이지가 뒤로 간다(첫 화면이면 앱이 닫힘)
     - 고칠 방향(리뷰어 제안): `onLoadStart={(e) => { if (e.nativeEvent.loading) overlayOpen.current = false }}` — 진짜 문서 읽기에서만 되돌림. 또는 웹이 pagehide 때 closed 를 보낸다. 실기기 확인표에 "확인창 위 충전 시트 → 뒤로 두 번"을 더한다
     - Minor(미룸, 실기기 확인표로): 아이폰 당김이 겹창 위에서도 켜져 있을 수 있음(`pullOn && !overlayOpen` 후보) · 안드로이드 기본 늘어남 효과와 웹 당김 표시가 겹침(`overScrollMode="never"` 후보) · 새로고침 요청 뒤 4초 안에 다시 당기면 요청이 겹침(무해, `onStart` 에 refreshing 확인 한 줄)
  2. [로컬에서, 운영자] `cd mobile && npx expo install expo-haptics` — 설치되면 `WebScreen.tsx` 의 `ui.haptic` 자리에 진동을 붙인다(light = impactAsync Light, success = notificationAsync Success)
  3. [운영자 결정] 앱 아이콘(Task 6) — 생성 전에 대상·스타일·프롬프트 합의. 대상 = `public/byeolkong-head.png` 별콩이 머리, 귀걸이·머리 위 고리 같은 잔장식은 덜어 냄, 배경 night `#1F1735` 계열. 지금 `mobile/assets/icon.png` 은 500px·모서리 투명이라 아이폰 제출에 걸린다. 상태바 아이콘은 이미 규격(96×96 흰 4꼭지 별)이라 그대로 둔다
  4. 아이콘까지 끝나면 HANDOFF 지우고 PR(base dev) + `@codex review`
- 확인 못 한 것: 실기기 전부(다음 빌드) · 기록으로 닫는 시트(보조 카드·별 충전)에 뒤로 버튼 → 주소가 한 칸만 바뀌는지(헤드리스로 그 시트까지 못 감)
- 건드리면 안 되는 것: BRIDGE_VERSION(올리지 말 것) · 옛 메시지의 선 위 모양 · 앱 토큰을 메시지에 싣기 · 운영 배포(앱 출시 때)
