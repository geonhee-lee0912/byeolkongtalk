# 사주 4종 상품 + 시간 기둥 엔진 — 설계

날짜: 2026-05-31
대상 프로젝트: byeolkong_talk (v2)

## 배경 / 목적

현재 `/select` 운세 선택 화면에는 사주 상품이 **"별콩이 사주" 1종**(22별)만 있다.
이를 **4종 별도 상품**(균일 20별)으로 확장한다. 4종 모두 사용자의 원국(태어난 4기둥)에
**대운/세운/월운**을 더하고, 특히 **오늘 들어온 일운(오늘의 일진, 두 글자)** 를 중심으로 고민을
풀어가는 흐름을 갖는다.

핵심 제약: 현재 코드베이스는 **원국 4기둥만** 계산한다(`lib/saju/calc.ts`).
대운/세운/월운/일운(시간 기둥)은 어디에서도 계산하지 않는다. 4종 상품 모두 시간 기둥을
요구하므로, **시간 기둥 엔진**을 먼저 만든 위에 4종 상품을 얹는다.

## 시간 기둥 엔진 (공통 토대)

`manseryeok`의 `calculateFourPillars(birthInfo)` 는 **임의의 날짜**를 받아 4기둥을 결정적으로 계산한다.
따라서 **오늘 날짜**를 넣으면:

- **세운** = 오늘 날짜의 연주
- **월운** = 오늘 날짜의 월주
- **일운(오늘 들어온 두 글자)** = 오늘 날짜의 일주(일진)

원국 계산과 동일한 정확도이며 Claude 추정이 개입하지 않는다.

### 대운 (가벼운 참고)

대운은 절기 경계 + 출생 나이/성별 방향(순행/역행) + 대운수가 필요하고, manseryeok이 노출하지 않는다.
**정밀한 대운 간지를 위조하지 않는다.** 대신:

- 사용자 **나이**(출생 연도 → 만 나이)만 결정적으로 계산해 컨텍스트에 넣는다.
- 프롬프트는 대운을 **"인생의 큰 흐름" 정도의 질적 참고**로만 언급하도록 가이드한다.
  (정확한 대운 간지를 단정하지 않음 — "지금 큰 흐름상…" 톤)

### 좋은 날 추천 — 한 달 일진 시퀀스

`good_days` 상품에 한해, 오늘부터 **향후 30일**의 일진(일운)을 `calculateFourPillars`로 하루씩
계산해 배열로 만든다(결정적, 30회 가벼운 호출). 프롬프트는 이 **실제 일진 목록에서** 좋은 날 /
피할 날을 골라 추천한다(날짜·간지를 위조하지 않음).

다른 3종 상품은 30일 배열을 계산하지 않는다(saju_data 비대화 방지).

### 신규 코드 (`lib/saju/calc.ts`)

```ts
export interface PillarLite { stem: string; branch: string; hanja: string; element: FiveElement; }
export interface TemporalLuck {
  date: string;            // "2026-05-31" (계산 기준일)
  age: number;             // 만 나이 (대운 참고용)
  year: PillarLite;        // 세운
  month: PillarLite;       // 월운
  day: PillarLite;         // 일운 = 오늘 들어온 두 글자
  dailyLuck?: { date: string; stem: string; branch: string; element: FiveElement }[]; // good_days 전용, 30일
}

export function calcTemporalLuck(
  baseDate: Date,
  birthYear: number,
  opts?: { includeMonth?: boolean }   // includeMonth=true → dailyLuck 30일 채움
): TemporalLuck
```

`saju_data` JSONB는 기존 `SajuResult` 형태에 `temporal: TemporalLuck` 필드를 추가해 그대로 저장한다.

## 상품 카탈로그 (모두 20별)

| product id | 이름 | 핵심 흐름 | 노출 조건 |
|---|---|---|---|
| `today_letters` | 오늘 들어온 글자 | 원국+대운/세운/월운 위에 **오늘 일운 두 글자 강조** → 그 글자가 고민과 어떻게 연결되는지 중심 + **오늘의 금기/주의 포인트** | 전체 |
| `nature` | 타고난 성향 기반 상담 | 원국 팔자(타고난 기질)를 세운/대운/월운으로 비춰 → 사용자의 본질에서 고민을 풀어감 | 전체 |
| `choice` | 선택지 비교 | 고민 속 선택지 A/B를 일운·오행 흐름으로 비교 | **선택/진로/새출발** 분류만 |
| `good_days` | 좋은 날 추천 | 고민 관련 팔자+대운/세운/월운 해석 → **일운 글자 기반** 좋은 날 + 피할 날 (향후 한 달) | 전체 |

기존 "별콩이 사주"는 `today_letters` 로 **대체**된다(신규 추가 아님).

선택지 비교 게이팅: `emotionTag ∈ { "어떤 선택이 맞을지 모르겠어", "내 앞날의 방향이 궁금해", "새로운 시작이 기대돼" }`.

## 상품별 프롬프트 출력 구조

페르소나 `data/persona/byeolkong.md`(정적·prompt caching)는 변경하지 않는다.
상품별 가이드는 `buildSystemMessage` 의 **동적 파트**에만 주입한다.

- **오늘 들어온 글자**: 여는 한 줄 → **오늘 일운 두 글자 강조 풀이**(이 글자가 오늘 너에게 들어온 기운) → 고민과 연결 → **오늘의 금기/주의 포인트** → 응원
- **타고난 성향**: 일간·오행으로 본 타고난 기질 → 지금 세운/월운(+대운 큰 흐름)이 그 기질을 어떻게 건드리는지 → 고민에 적용
- **선택지 비교**: 선택지 A 기운 → 선택지 B 기운 → 일운/오행 관점 비교 → 기우는 쪽(단정 금지, 흐름·가능성 톤)
- **좋은 날 추천**: 고민 맥락 해석 → **일운 시퀀스에서 고른** 좋은 날 N개 + 피할 날 + 각 이유 → 응원

공통: 단정 금지, 흐름·가능성·선택 키워드 중심. 기존 [END] 3단 수렴 / askBonus 프로토콜 그대로 유지.

## 변경 지점

### 데이터 모델
- 마이그레이션: `readings.saju_product TEXT NOT NULL DEFAULT 'today_letters'`
- `saju_data.temporal` 에 `TemporalLuck` 직렬화 저장
- `lib/saju/constants.ts` `SAJU_READING_COST` 22 → 20

### `lib/saju/calc.ts`
- `calcTemporalLuck(...)` + `TemporalLuck`/`PillarLite` 타입 추가

### `lib/claude.ts`
- `SajuReadingContext` 에 `sajuProduct: SajuProduct` 추가
- `formatTemporalBlock(temporal)` 신규 — `[오늘의 기운]` 세운·월운·**일운 ★** (good_days면 30일 요약 포함)
- 상품별 가이드 4종 — 기존 `firstTurnGuide` 자리에서 `sajuProduct` 로 분기 (첫 턴 출력 구조를 상품별로)
- `SajuProduct` 타입 정의 (4종 유니온) + 게이팅 헬퍼는 `/select` 와 공유할 수 있게 적절한 위치(예: `lib/saju/products.ts`)에 둔다

### 경로 스레딩
- `/select`: 사주 카드 1개 → 최대 4개. 선택/진로/새출발 외 분류면 `choice` 카드 숨김(3개). 선택 시 `PENDING_KEY` 에 `sajuProduct` 동봉
- `/saju`(생년 입력) → `/api/readings` POST 에 `sajuProduct` 전달
- `/api/readings`: body `sajuProduct` 화이트리스트(4종) 검증 → `calcTemporalLuck` 호출(good_days면 30일 포함) → `saju_data.temporal` 병합 + `saju_product` 저장. `stars_spent` = 20
- `/api/consultations/saju/chat`: `reading` select 에 `saju_product` 추가 → `buildSystemMessage` ctx 에 주입

### UI (`/select`)
- 사주 섹션: 4개 카드(아이콘/이름/가격 20별/설명/대표 흐름 라벨). 추천 로직은 기존 SAJU_EMOTIONS 유지하되 추천 대상 상품은 `today_letters`(기본)로 둔다
- `choice` 카드는 게이팅 분류에서만 렌더

## 비범위 (YAGNI)
- 정밀 대운 간지 계산 / 절기 엔진
- 상품별 차등 가격 (균일 20별로 확정)
- 가족·지인 사주 (기존대로 self 만)
- 좋은 날 추천의 30일 초과 범위

## 구현 순서 (writing-plans 단계에서 상세화)
1. 시간 기둥 엔진 (`calcTemporalLuck`) + 타입
2. 마이그레이션 + `SAJU_READING_COST` 20
3. `lib/claude.ts` 상품 분기 + `formatTemporalBlock`
4. `/api/readings` + chat route 스레딩
5. `/select` 4카드 + 게이팅
6. 타입체크 + 수동 검증
