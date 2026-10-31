# 별콩톡 현재 사용자 흐름

> `AGENTS.md` 에서 뺀 절. 화면·라우트·탭을 건드릴 때 읽는다.


- `/` 홈 → 연애 존 6태그(`LOVE_TAGS`) + 궁합 크로스링크 + 비연애 4태그(`OTHER_TAGS`)
- 태그 → 로그인 가드 → `/concern`(감정 칩 + 고민 10~200자) → **타로 직행**(사주/타로 picker 없음)
- `/tarot`(태그별 큐레이션 5, `TAG_SPREADS`) → `/tarot/draw` → `/tarot/reading`(SSE → `[END]` → 결과/공유)
- **사주는 상담 진입 폐쇄** — `/select` 는 `/concern` 리다이렉트 스텁(구 링크 하위호환). `/saju*` 는 기존 reading 열람·resume 전용. 새 사주 수요는 `/fortune` **one-shot 리포트**가 받는다
- `/relationship` "연애 상담" — 지속 대화형 스레드(종결 없음). 미등록=콜드스타트+상대등록 / 등록=스레드
- 이어가기: 완료 reading 참조 새 reading(`/api/readings/continue`, `previous_reading_id`+`continuation_mode`). deep = 정가×0.6. UI 는 `ContinuationModal`(타로만 fresh 버튼 있음, 사주는 deep 단일)
- 레이아웃 (`components/layout/`): `AppShell` 이 pathname 기반(`/login` 제외) `Header`+`BottomTab` 자동 부착(`pb-20`). **BottomTab 5탭** (라벨은 `BottomTab.tsx` 의 `TABS` 가 정본) = 타로톡`/` · 사주 운세`/fortune` · **별마루`/byeolmaru`** · 별콩 상점`/shop` · 마이`/mypage`. 보관함`/readings` 는 마이에서 진입(`?from=history` 시 마이 탭 하이라이트).
  - 🔴 **`우리 사이` 탭은 2026-09-04 제거됨 → 그 자리가 별마루**(`c34a4cf`). `/relationship` 페이지·코드는 **살아 있고** 진입점만 별마루 안 슬롯으로 옮겼다 — 스레드는 죽었지만(8월 85건 중 무료 3턴 통과 0명·별 소모 0) **상대 등록의 64.6%(월 84건)가 이 경로**라 끊으면 별마루 "우리 오늘"의 연료가 마른다. → **2026-09-06 `/relationship` 진입점을 홈 고정 카드('별콩이와 연애 상담', 구 궁합 슬롯)로 이동**하고 별마루 탭 `matchPrefixes` 에서 `/relationship` 을 **제거**했다. 이제 `/relationship` 은 어떤 하단탭도 활성이 아니다(홈에서 진입하는데 3탭이 켜지는 게 어색). 진입은 홈 고정 카드 + 캐러셀 sim. 근거·판정 = `specs/2026-08-31-별마루-리텐션허브-design.md` §7-b
  - `Footer` 는 **홈과 마이페이지에서만**(마이페이지는 로그인 게이트 뒤라 크롤러가 보는 건 사실상 홈 하나 — SEO 상 중요)

