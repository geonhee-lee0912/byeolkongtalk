# 내 고민톡(/readings) 채팅방 목록 리디자인

- 작성일: 2026-06-08
- 대상 화면: `/readings` (하단탭 "내 고민톡")
- 컨셉: 각 리딩을 **"별콩이와 나눈 대화방"** 으로 보여주는 카톡 채팅방 목록 느낌

## 1. 배경 / 문제

현재 `/readings` 는 리딩 기록을 정보 카드(질문 + 메타) 형태로 나열한다. 카톡 채팅방
목록 같은 친근한 컨셉으로 바꿔서, "별콩이와 계속 대화를 이어가는 공간"이라는
정서를 만들고 싶다.

기존 구조의 한계:
- 행이 정보 카드라서 "대화방"으로 안 읽힘 — 누구랑 무슨 얘기를 했는지 한눈에 안 들어옴.
- 사주 리딩은 매번 같은 일주(예: 甲子)만 보여서 단조롭고, 타로(카드 이미지)에 비해
  목록에서 임팩트가 떨어짐.

## 2. 목표 / 비목표

**목표**
- 두 탭(`고민 상담` / `별콩 운세`) 유지하되, 양쪽 모두 채팅방 행으로 통일.
- 행마다 "이번 대화는 뭐가 달랐나"를 아바타로 표현 (아바타 = 매번 달라지는 것).
- 별콩이 답변 도입부를 미리보기 2줄로 보여줘 대화방 느낌 강화.
- 사주 리딩도 타로만큼 목록에서 알록달록 살아 있게.

**비목표 (이번 범위 밖)**
- 탭 구조 변경 (2탭 유지).
- 별콩 운세 탭의 기존 아이콘 교체 (FORTUNE_CONFIG 이모지 / saju_full 붉은말 그대로).
- 결과/상세 페이지(`/readings/[id]` 등) 변경.
- 정렬·페이지네이션 로직 변경 (PAGE_SIZE 등 기존 유지).

## 3. 행(Row) 레이아웃

```
┌──────────────────────────────────────────────┐
│ [48×48     ] 제목줄: 감정태그 · (프로필칩) · (이어하기)   어제 │
│ [ 아바타   ] (서브텍스트: 사주만)                          │
│ [          ] 미리보기 별콩이 답변 도입부 ……                │
│              두 번째 줄까지 (line-clamp 2)                  │
└──────────────────────────────────────────────┘
```

- 컨테이너: `display:flex; gap:11px; align-items:flex-start`, 카드형 배경
  (`cream-warm` 계열 + lilac-soft 보더 + rounded), 행 간 `margin-bottom:8px`.
- 좌측 아바타 영역: `flex:0 0 auto`.
- 본문: `flex:1; min-width:0` (말줄임 위해 필수).
- 타임스탬프: 제목줄 우측 `margin-left:auto`.

### 3.1 제목줄
- **감정 태그** (`emotionTag`) — 볼드, eye-purple. 행의 주 제목.
- **프로필 칩** — `profile.relation_type` 가 본인(self)이 아니면 표시 (예: `엄마`).
  lilac-soft pill. self면 생략.
- **이어하기 배지** — 타로이면서 `ended === false` 일 때만. lilac-deep 배경 흰 텍스트 pill.
- **타임스탬프** — 우측 정렬, 상대시간(어제 / N일 전 / M/D).

### 3.2 서브텍스트 (사주 행에만)
`상품명 · OO 사주 甲子` 형태. 일주(`dayPillar`)는 여기로 강등.
- 예: `오늘 들어온 글자 · 내 사주 甲子`
- 예: `타고난 성향 기반 · 엄마 사주 戊午`
- 타로 행은 서브텍스트 없음.

### 3.3 미리보기 (2줄)
- 별콩이 첫 답변의 **도입부** 텍스트. 마커(`[CARD:n]`, `[END]`) 제거.
- `line-clamp: 2` (`-webkit-box`, `-webkit-line-clamp:2`).
- `font-size ~11.5px`, text-light 계열.
- 답변이 아직 없는(생성 중/실패) 행은 미리보기 영역을 비우거나
  "별콩이가 답을 준비하고 있어" 같은 placeholder 한 줄.

## 4. 아바타 — "매번 달라지는 것"

| 행 종류 | 아바타 |
|---|---|
| 타로 (고민 상담) | 뽑은 카드 스택 (drawn_cards 이미지, 살짝 겹침). 카드 없으면 fallback 타일 |
| 사주 (고민 상담) | 사주 4종 전용 일러스트 아이콘 (아래 §5) |
| 별콩 운세 탭 | 기존 `FORTUNE_CONFIG` 이모지 / `saju_full` 은 붉은말 (`red_horse.png`) — 현행 유지 |

- 타로 카드 스택: 카드 `width 32 × height 50` 정도, 좌측부터 `margin-left:-20px` 겹침,
  흰 보더 + 그림자. 최대 3장 노출.
- 아바타 공통 크기 기준: 48×48 타일. 카드 스택은 높이가 더 큰 portrait라
  세로 중앙 정렬.

## 5. 사주 4종 아이콘 (확정 에셋)

사용자가 직접 만든 풀컬러 파스텔 일러스트(투명 배경 PNG). 운세 탭 이모지와 겹치지
않는 새 세트. `SajuProduct` 4종에 1:1 매핑한다.

| SajuProduct | 라벨 | 현재 파일(public 루트) | 일러스트 |
|---|---|---|---|
| `today_letters` | 오늘 들어온 글자 | `today_letters.png` | 패 두 장 (日/運, 금색) |
| `nature` | 타고난 성향 기반 상담 | `nature.png` | 오행 휠 (4분할) |
| `choice` | 선택지 비교 | `choice 02.png` | 카드 두 장(별/달) + 양방향 화살표 |
| `good_days` | 좋은 날 추천 | `good days.png` | 별 표시 달력 + 체크 |

> 탈락 변형: `choice.png`(저울 버전), `days.png`(구름 달력 버전) — 사용하지 않음.

### 5.1 에셋 정리 (구현 시 선행 작업)
파일명에 공백이 있으면(`choice 02.png`, `good days.png`) URL 인코딩이 필요하고
깨지기 쉽다. **product ID 기준 무공백 경로로 정리**할 것:

```
public/icons/saju/today_letters.png   ← today_letters.png
public/icons/saju/nature.png          ← nature.png
public/icons/saju/choice.png          ← "choice 02.png"
public/icons/saju/good_days.png       ← "good days.png"
```

`SajuProduct` ID 그대로 파일명을 맞추면 `/icons/saju/${sajuProduct}.png` 로 매핑 가능.

### 5.2 렌더링 (당초 "단색 글리프 + 컬러 타일"에서 변경)
당초 스펙은 단색 글리프를 상품별 컬러 타일에 얹는 안이었으나, 실제 에셋은
배경까지 포함한 **풀컬러 일러스트**다. 따라서:
- 아바타 = 일러스트를 48×48 **중립 소프트 타일**(예: `cream` 또는 `lilac-soft`
  배경의 rounded square) 위에 중앙 배치. 상품별 컬러 타일은 불필요 —
  일러스트 자체가 색을 가지고 있어 목록이 충분히 알록달록함.
- `object-fit: contain`, 내부 패딩 약간.

## 6. 데이터 변경 (필수)

미리보기(§3.3)를 위해 별콩이 첫 답변 도입부가 필요한데, **현재 `GET /api/readings`
는 assistant 메시지 텍스트를 반환하지 않는다** (유저 `question` 만 반환).

### 변경: `GET /api/readings` 에 `preview` 필드 추가
- 응답 리딩 목록의 ID들로 `messages` 테이블을 **배치 조회** (이미 ended/generating
  판정 위해 messages 를 배치 조회하고 있으므로 그 쿼리에 합치거나 옆에 추가).
- 각 reading 의 **첫 assistant 메시지** 본문을 가져와:
  1. 마커 제거 (`[CARD:n]`, `[END]`, 미완성 마커),
  2. 앞부분 약 80~100자로 절단,
  3. `preview: string` 필드로 응답에 포함.
- assistant 메시지가 없으면 `preview: null` (프론트에서 placeholder 처리).
- `ReadingItem` 인터페이스에 `preview?: string | null` 추가.

> 성능: 기존에도 messages 를 reading ID 묶음으로 한 번에 쿼리하므로 N+1 없이
> 같은 패턴으로 first-assistant-content 를 함께 가져온다.

## 7. 영향 파일

- `app/readings/page.tsx` — 행 렌더 구조 교체(아바타/제목줄/서브텍스트/미리보기),
  `ReadingItem` 에 `preview` 추가, 사주 아바타 아이콘 매핑 추가.
- `app/api/readings/route.ts` — select/배치쿼리에 첫 assistant 메시지 도입부 추가,
  마커 strip + 절단 후 `preview` 응답.
- `public/icons/saju/*.png` — 4종 아이콘 정리 배치(§5.1).
- (신규 헬퍼 가능) 사주 product → 아이콘 경로 매핑은 `/icons/saju/${sajuProduct}.png`
  규칙으로 충분, 별도 상수 불필요.

## 8. 검증 기준

- 고민 상담 탭: 타로 행은 뽑은 카드 스택, 사주 행은 4종 일러스트 아이콘이 뜬다.
- 사주 행: 제목(감정태그)·서브텍스트(상품 · 사주 일주)·2줄 미리보기가 모두 보인다.
- 타로 미완료 대화에 `이어하기` 배지가 뜬다.
- 본인 외 프로필(엄마 등)일 때만 프로필 칩이 뜬다.
- 미리보기에 `[CARD:n]`/`[END]` 마커가 노출되지 않는다.
- 답변 없는 행도 레이아웃이 깨지지 않는다.
- 별콩 운세 탭 아이콘은 기존 그대로다 (회귀 없음).
