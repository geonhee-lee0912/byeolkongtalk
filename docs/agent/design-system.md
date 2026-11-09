# 별콩톡 디자인 시스템

> `AGENTS.md` 에서 뺀 절. 화면 일을 할 때 읽는다. 값의 정본은 `app/globals.css` 의 `@theme`·`@utility`, 결정 근거는 스펙 `docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md`.
> **규칙은 `lib/design-rules.test.ts` 가 잠근다.** 예외는 파일 단위 허용 목록(이유 주석 필수) 또는 그 줄·윗줄의 `design-allow: <이유>` 주석. 허용 목록을 늘릴 땐 이유를 적는다.

## 색

| 토큰 | HEX | 용도 |
|---|---|---|
| `cream` / `cream-warm` | `#FAF6F0` / `#FFF8F0` | 화면 바탕 / 말풍선·입력칸 |
| `lilac-soft` / `lilac` / `lilac-mid` / `lilac-deep` | `#E8DEF5` / `#D4C7EE` / `#B8A8D8` / `#9F8AD0` | 보조 버튼·번호 타일 / 테두리 / 테두리 / **글자가 아닌 곳**(아이콘·장식) |
| `gold` / `gold-soft` / `gold-wash` | `#E8C26A` / `#F2D78A` / `#FBF1D6` | 별 재화 / 장식 / 골드 안내 배너 바탕 |
| `night` / `night-deep` | `#1F1735` / `#2A1F4D` | 밤 장면 |
| `inner` | `#FBF8FE` | 안쪽 칸 바탕 |

**글자색 4개**(밝은 바탕 4.5:1 이상): `eye-purple` #5A3E8C 제목·본문 · `text-light` #726398 설명·날짜·메타 · `accent` #775CB0 칩·라벨·강조 글자·**주 버튼 바탕** · `text-faint` #978AB3 입력 전 안내·못 누르는 상태만. 투명도 글자(`text-text-light/70` 등) 금지. 밤 바탕 위 강조 글자는 `accent-on-dark`(#9F8AD0).

## 글자 크기 10단계 — 기기 글자 설정과 무관하게 고정

`text-28` 표지 · `text-22` 화면 제목 · `text-20` 큰 소제목 · `text-17` 시트·창 제목·리포트 소제목 · **`text-16` 읽는 본문**(상담 말풍선·리포트 본문) · `text-15` 주 버튼·강조 본문 · `text-14` 일반 본문 · `text-13` 작은 본문 · `text-12` 보조 · `text-11` 캡션(가장 작은 글자). 큰 숫자 `text-44`·`text-52`. 임의 px(`text-[13px]`)·Tailwind 기본(`text-sm`) 금지.
- `html { font-size: 16px }` 고정 + 앱 웹뷰 `textZoom={100}`. 나중에 기기 설정을 따르게 하려면 이 둘을 같이 푼다.
- 폰 입력칸은 16 유지(아이폰 확대 방지 — `pointer: coarse` 규칙, 레이어 밖에 둘 것).

## 모서리 · 그림자

- 모서리: `rounded-lg` 8 작은 타일 · `rounded-xl` 12 **모든 버튼**·입력칸·안쪽 칸 · `rounded-2xl` 16 카드·말풍선 · `rounded-3xl` 24 시트·창·큰 배너 · `rounded-full` 칩·배지 · 말풍선 꼬리만 `rounded-*-sm`. 안에 든 것은 바깥보다 덜 둥글게.
- 그림자: `shadow-card` 바닥 카드 · `shadow-float`(`-up`) 토스트·메뉴·고정 막대 · `shadow-modal` 확인창. 바텀시트는 그림자 없이 뒤 막. 임의 그림자·색 그림자 금지(`drop-shadow` 그림 필터는 별개).

## 부품

- **버튼** `btn` + 종류 `btn-primary`(강조 보라)·`btn-secondary`(연보라)·`btn-text` + 크기 `btn-lg` 52(폭 가득)·`btn-md` 44·`btn-sm` 36. 처리 중 `<ButtonDots />`. 예외: 카카오·애플 규정 버튼, 탈퇴·삭제 위험 버튼, 금색 구독·별 CTA, 스프레드 색을 받는 별 확인창 버튼.
- **카드** `card`(크림 위 바닥 카드 — 그림자만, 테두리 없음) · `card-report`(글 많은 리포트, 안쪽 20) · `card-inner`(카드·시트 **안**의 칸 — 옅은 바탕+얇은 테두리) · `card-night`/`bg-night-card`(밤 카드 그라데이션 하나). 선택한 카드·선택지는 `outline-2 outline-accent -outline-offset-2`.
- **간격**: 화면 좌우 20 · 카드 사이 12 · 섹션 사이 24 · 섹션 제목→첫 카드 12.
- **아이콘** `<Icon name size />`(`components/common/Icon.tsx`) 면 아이콘 30종 — 정본 그림은 스펙 assets 의 `아이콘-30종.json`(테스트가 대조). 별 재화 `star` 만 금색 고정. 상품·고민·운세 종류는 `public/icons/**` 일러스트(`FortuneIcon`).

## 장식

그라데이션·빛·움직임은 **장면과 기능에만**: 밤하늘 장면(고민 채팅창·광고 랜딩 첫 화면·히어로 배너)·연애 시뮬 무대·형광펜 밑줄·글 끝 흐림·진행 막대·카드 뽑기 의식·잠긴 결과 흐림. 카드·배너·버튼·타일은 단색. 반짝이 ✦·둥둥 움직임·배경 빛 덩어리 금지(로딩·카드 뽑기·시뮬만 예외). 시트·창 뒤 막은 `bg-night/50 backdrop-blur-sm` 하나, 별콩이 후광은 `bg-gold/30 blur-lg` 하나.

## 이모지

화면 글자에 이모지·기호(✕ ✓ ⭐ ★ → › ▾ 등)를 쓰지 않는다 — 면 아이콘이나 일러스트로. 그대로 두는 것: 모델 프롬프트, 카톡·복사 공유 문구, 앱 푸시 문구, 별마루 날짜 기호(✧◇△◈), 약관 ※, 그래프 범례 ●. 리포트 소제목 앞 이모지는 데이터에 남아도 화면에선 번호 타일(`stripHeadingEmoji`). 타로 5장 이상 풀이의 카드 라벨(🃏💫🔗)은 페르소나 출력이라 아직 남아 있다(ROADMAP 나중).

## 그 밖

- 오행 색상은 별콩이 톤(전통 채도와 다름) — `components/saju/SajuBoard` 의 `ELEMENT_COLORS`. 일관 유지.
- 화면 바탕(`html`)의 크림→연보라 세로 그라데이션, 운세·별마루 탭 머리 배너 번짐은 아직 정하지 않았다(스펙 §6).
