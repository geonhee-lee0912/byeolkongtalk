# 2026년 사주 분석(saju_full) 리뉴얼 + 운세 결과 뒤로가기 버튼 — 설계

작성일: 2026-06-07

## 1. 목표 / 배경

두 가지를 함께 처리한다.

- **Task A (간단):** `오늘의 운세`·`이번달 어떤 일들이`·`2026년 사주 분석` 세 운세 결과 화면 좌상단에 뒤로가기 버튼 추가. 세 상품 모두 단일 파일 `app/fortune/result/page.tsx`로 렌더되므로 한 번의 변경으로 끝난다.
- **Task B (핵심):** `2026년 사주 분석`(saju_full)을 50별 값을 하는 프리미엄 리포트로 대폭 강화. 현재 saju_full은 7개 마크다운 섹션을 generic `parseSections` fallback(크림색 박스 나열)으로 렌더 — 가장 비싼 상품인데 가장 단순한 화면이다. **내용(7→17 섹션)과 화면(전용 뷰 + 서브탭)** 양쪽을 함께 끌어올린다.

값을 하는 느낌의 핵심은 (a) 분량/다양성 확장, (b) 결정론적 사주판 위젯, (c) 서브탭으로 스크롤 압박 분산, (d) 다크 종합운/한마디 같은 프리미엄 톤.

## 2. 확정 디자인 (목업 v5 기준)

확정 목업: `.superpowers/brainstorm/1946-1780787949/content/report-mockup-v5.html`

화면 구성(위→아래):

1. **헤더** — 마스코트 + `2026년 · 병오년(丙午年)` + `🪷 2026 사주 분석`
2. **다크 종합운 카드** (공통, 서브탭 위) — `2026 종합운` 라벨 → 테마 한 줄(예: "단단히 뿌리내리고 뻗어나가는 해") → 행운칩(색·방향·행운의 달·키워드) → 구분선 → **한 해 요약** 문단. 다크 그라데이션 `linear-gradient(140deg,#2A1F4D,#1F1735)` + 골드 포인트. **별점·숫자 점수 없음(삭제 확정).**
3. **사주판 박스** (공통) — 크림 박스로 감쌈. 4기둥 grid(칸별 오행 색) + 오행 카운트 한 줄(목/화/토/금/수 각 글자가 오행 색) + **일간 박스**(오행 색 배경 + 흰 글자, "나를 상징하는 일간 / 丁 · 정화(火)"). **음양(양3·음5) 없음.**
4. **서브탭 4개** — `나라는 사람` / `2026년 총운` / `월간 운세` / `행운 가이드`
   - **나라는 사람:** 타고난 기질·성격 / 강점·재능 / 조심할 성향·보완점 / 오행 밸런스 진단(+보완칩) / 타고난 적성·어울리는 일
   - **2026년 총운:** 큰 흐름·테마 / 마음·감정 흐름 / 사랑·인연 / 인간관계·사회 / 일·커리어 / 재물·금전 / 건강·컨디션
   - **월간 운세:** 2026 월별 흐름(1~12월) / 주목할 시기(흐름 좋은 달 vs 점검할 달 표)
   - **행운 가이드:** 행운 가이드 칩 / 올해 이것만은 — 실천 3가지 / 별콩이의 한마디(다크톤)

## 3. Task A — 뒤로가기 버튼

`app/fortune/result/page.tsx`의 `FortuneResultInner` 정상 렌더 분기(`return (<main …>`) 최상단에, 세 상품 공통으로 보이는 좌상단 뒤로가기 버튼 추가.

- 위치: `main` 안 최상단, daily/monthly가 자체 헤더를 그리는 경우에도 항상 보이도록 조건 분기 **밖**에 배치.
- 동작: `router.back()`. (router는 이미 `useRouter()`로 확보돼 있음.)
- 스타일: 기존 톤(예: `‹ 뒤로` 텍스트 또는 chevron, `text-text-light` 계열)으로 가볍게. `max-w-md mx-auto px-5` 정렬에 맞춤.
- loading/error 화면에는 불필요(이미 별콩 운세로 돌아가는 링크 존재) — 정상 화면에만 추가.

## 4. Task B — saju_full 리포트 구조

### 4.1 렌더링 전략 (하이브리드: 결정론 사주판 + AI 구조화 JSON)

daily/monthly가 검증된 **구조화 JSON + 결정론 데이터 병합** 패턴을 그대로 따른다.

- **결정론 절반:** 사주판은 AI가 아니라 `readings.saju_data`(이미 JSONB로 저장됨, `/api/readings/[id]`가 `sajuData` 반환)로 렌더. 즉 사주판/오행/일간은 계산값 그대로 — 환각·오타 없음.
- **AI 절반:** 나머지 서술·위젯은 단일 JSON 객체로 생성. free-form 마크다운 heading 파싱(취약)이 아니라 daily/monthly처럼 필드 기반으로 결정론적 렌더. 파싱 실패 시 1회 재생성 후 실패 처리(깨진 템플릿 저장 금지) — 기존 create 라우트 규약 동일.
- 토큰: `MAX_TOKENS_BY_FORTUNE.saju_full = 8192`(현행 유지). 17섹션 출력 추정 ~2.5~3.5K 토큰으로 여유. 섹션 본문은 문장 수로 상한.

> 공개 공유 링크(`/api/readings/[id]/public`)는 `sajuData: null`을 반환 → 공유 화면에선 사주판 박스 생략(서술/위젯만). 스펙상 허용.

### 4.2 AI JSON 스키마 (`SajuFullReportAI`)

```jsonc
{
  "theme": "<2026년을 관통하는 테마 한 줄. 20자 내외>",
  "summary": "<한 해 요약 3~4문장 — 종합운 카드 하단 문단>",
  "lucky": {
    "color": "<행운 색 이름>",
    "direction": "<행운 방향, 예: 동쪽>",
    "months": "<행운의 달, 예: 3월·8월>",
    "keyword": "<키워드 한 단어>"
  },
  "self": {
    "nature":    "<타고난 기질·성격. 일간·오행 기반. 4~5문장>",
    "strength":  "<강점·빛나는 재능. 4~5문장>",
    "caution":   "<조심할 성향·보완점. 따뜻한 톤. 4~5문장>",
    "balance":   { "lack": "<부족/과다 오행 진단 2~3문장>", "supplements": ["<보완 칩1>", "<칩2>", "<칩3>"] },
    "aptitude":  "<타고난 적성·어울리는 일. 4~5문장>"
  },
  "year": {
    "flow":          "<2026년 큰 흐름·테마. 가장 긴 도입 5~6문장>",
    "mind":          "<마음·감정 흐름. 4~5문장>",
    "love":          "<사랑·인연. 4~5문장>",
    "relationship":  "<인간관계·사회. 4~5문장>",
    "career":        "<일·커리어. 4~5문장>",
    "wealth":        "<재물·금전. 4~5문장>",
    "health":        "<건강·컨디션. 4~5문장>"
  },
  "monthly": [ { "month": 1, "body": "<1월 흐름·조언 2~3문장>" }, … 12개 ],
  "timing": { "good": "<흐름 좋은 달, 예: 4·9·11월>", "caution": "<점검할 달, 예: 6·7월>" },
  "actions": ["<올해 실천 1>", "<실천 2>", "<실천 3>"],
  "note": "<별콩이의 한마디. 따뜻한 응원 2~3문장>"
}
```

검증 규칙(daily/monthly와 동형): 필수 문자열 non-empty, `monthly`는 1~12월 전부 존재, `self`/`year` 하위 키 전부 존재, `supplements`/`actions` 배열 1개 이상. 하나라도 누락 시 parse null → 재생성.

### 4.3 저장 최종본 (`SajuFullReport`)

```ts
interface SajuFullReport extends SajuFullReportAI {
  v: 1;
  year2026: { stem: string; branch: string; hanja: string }; // 병오 — 결정론 표기용
}
```

저장 위치: 기존과 동일하게 `messages.content`에 JSON 문자열로. 사주판은 `readings.saju_data`에서 별도로 읽음.

### 4.4 새 파서/빌더 — `lib/fortune/saju-full-report.ts`

`monthly-report.ts`를 본떠:
- `parseSajuFullReportJson(raw): SajuFullReportAI | null` — `{`~`}` 추출 후 검증.
- `buildSajuFullReport(ai): SajuFullReport` — `v:1` + 병오년 표기 병합(상수, 2026 고정).
- `serializeSajuFullReport(r): string`
- `tryParseStoredSajuFullReport(content): SajuFullReport | null` — `v:1` 빠른 컷.

### 4.5 프롬프트 — `lib/fortune/prompt.ts`

`SECTION_GUIDE.saju_full`을 마크다운 섹션 나열 → **JSON 형식 지시**로 교체(daily/monthly 지시문과 동일 톤: "마크다운 아닌 JSON 하나만, 코드펜스 금지"). 4.2 스키마를 그대로 박고, 규칙(반말 친구 말투, 단정 금지, 흐름·가능성, 좋기만 한 예언 금지, escape 규칙) 동일 적용. 기준 연도 2026 병오년 명시.

### 4.6 생성 wiring — `app/api/fortune/create/route.ts`

`else if (cfg.type === "monthly")` 옆에 `else if (cfg.type === "saju_full")` 분기 추가: `parseSajuFullReportJson` → 실패 시 1회 재생성 → 그래도 실패면 `generation_failed` → `serializeSajuFullReport(buildSajuFullReport(ai))`. (saju_full은 temporal 의존 없음 — 2026 고정이라 `saju.temporal` 가드 불필요.)

### 4.7 새 컴포넌트 — `components/fortune/saju-full/SajuFullReportView.tsx`

- props: `report: SajuFullReport`, `saju: SajuResult | null`(공유 시 null), `dateLabel`/헤더 텍스트.
- 구성: 다크 종합운 카드 → 사주판 박스(아래 4.8) → 서브탭(클라이언트 state로 active pane 전환) → pane별 섹션 카드.
- 다크 종합운/별콩 한마디: 목업의 `verdict-dark`/`byeol-dark` 톤을 Tailwind로. 별점·점수 없음.
- 보완칩/행운칩/실천 3가지/월별 리스트/주목 시기 표: 목업 마크업 대응.

### 4.8 사주판 — 공유 컴포넌트 변경 + 리포트 사용법

**공유 변경(사용자 요청 #3 — 가로길이·간격을 모든 사주판에 적용):** `components/saju/SajuBoard.tsx`의 4기둥 grid에 폭 축소 적용(예: grid에 `max-w-[300px] mx-auto`). gap은 현행 `gap-2.5`(=10px) 유지(목업과 동일). **사용처 6곳**(`saju/concern`, `saju/reading`, `saju/result`, `mypage`, `FortuneSajuPicker`, `ProfilePicker`)에서 레이아웃이 깨지지 않는지 확인 후 적용. 깨지는 곳이 있으면 변경 범위를 prop으로 옵트인하는 방식으로 후퇴.

> 오행 카운트 행은 SajuBoard가 **이미 칸별 오행 색 칩**으로 렌더 중(요청 #1 충족) — 별도 변경 불필요.

**리포트 사용법:** `SajuFullReportView`는 `<SajuBoard saju={saju} showDetail={false} />`로 4기둥 + 오행 행만 재사용(일간/음양 인라인 요약 숨김). 그 아래에 **리포트 전용 일간 박스**(오행 색 배경 + 흰 글자)를 직접 렌더 → 음양 자연 제거 + 일간 강조. 전체를 크림 `board-box`로 감쌈.
- 일간 박스 배경색: `saju.dayElement`에 대응하는 **진한 오행 색**(흰 글자 가독). 예: 화 계열의 진한 톤. (파스텔 `ELEMENT_COLORS.bg`는 흰 글자 부적합 → 진한 톤 맵 사용.)

### 4.9 결과 페이지 wiring — `app/fortune/result/page.tsx`

- fetch 시 `setSajuData(r.reading.sajuData)` 추가(state 신설).
- `ft === "saju_full"`이면 `tryParseStoredSajuFullReport(report)` → `sajuFullReport` state.
- 렌더 분기: daily/monthly처럼 `isSajuFull && sajuFullReport ? <SajuFullReportView … /> : (기존 fallback)`. saju_full도 자체 헤더 영역을 가지므로 상단 공통 헤더 블록 숨김 조건에 saju_full 추가.
- 공유 텍스트: `buildSajuFullShareText(report, label, url)` 추가(테마·요약·핵심 섹션·행운·한마디·URL).

## 5. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `app/fortune/result/page.tsx` | 뒤로가기 버튼, sajuData state, saju_full 분기/렌더, 공유 텍스트 |
| `lib/fortune/prompt.ts` | `SECTION_GUIDE.saju_full` → JSON 지시 |
| `lib/fortune/saju-full-report.ts` (신규) | 파서·빌더·직렬화·복원 |
| `app/api/fortune/create/route.ts` | saju_full 파싱·검증·저장 분기 |
| `components/fortune/saju-full/SajuFullReportView.tsx` (신규) | 전용 뷰 + 서브탭 |
| `components/saju/SajuBoard.tsx` | 4기둥 폭 축소(공유) |
| `lib/fortune/types.ts` | (필요 시) 상수 정리 — MAX_TOKENS 8192 유지 |

## 6. 리스크 / 완화

- **JSON 파싱 실패:** 17섹션 큰 출력 → 재생성 1회(기존 규약). 8192 토큰 여유로 truncation 위험 낮음. 섹션 문장 수 상한으로 추가 방지.
- **SajuBoard 폭 축소 부작용:** 6개 사용처 회귀 확인 필수. 깨지면 prop 옵트인으로 후퇴.
- **공유 링크 사주판 부재:** public 라우트가 sajuData null → 사주판 생략(서술/위젯은 노출). 허용.
- **근거 빈약(같은 기초 데이터로 17섹션):** 각 섹션 각도를 분명히 구분(기질/강점/보완/적성/감정/사랑/관계/일/재물/건강/월별)해 반복·물타기 방지 — 프롬프트에서 섹션별 관점 명시.

## 7. 범위 밖

- 십성·대운·용신·신살 등 신규 사주 계산(현재 `calc.ts` 미산출) — 도입 안 함.
- 별점/숫자 점수(삭제 확정).
- OG 공유 이미지 saju_full 전용 포맷 — 추후.
- tarot_oneshot / compat 상품.
