# 운세 리포트 깊이 사다리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운세 유료 리포트의 분량이 정가에 비례하도록(역전 제거) — 싼 궁합(1,778자)·좋은날(~1,000자)을 monthly(2,990자) 수준 이상으로 레벨업.

**Architecture:** 리포트 길이는 `lib/fortune/prompt.ts`의 `SECTION_GUIDE[type]` 안 **필드별 문장 수 지시**가 유일하게 제어한다(페르소나 "600~900자"는 모순·무시됨, max_tokens는 넉넉, 파서엔 길이캡 없음). 따라서 **필드별 문장 수를 상향**하는 프롬프트 편집만으로 분량이 오른다 — 파서/렌더러/타입/스키마·max_tokens 전부 무변경(필드 추가만 그쪽으로 번지므로 필드는 추가하지 않는다. good_days만 마크다운이라 섹션 1개 추가 허용).

**Tech Stack:** Next 16 App Router · 운세 리포트 = 구조화 JSON(daily/monthly/saju_full/compat/compat_social) + good_days 마크다운 · 모델 sonnet 유지(유료, `fortuneModel`) · 프롬프트 파일 `lib/fortune/prompt.ts` + 페르소나 `data/persona/byeolkong_fortune.md` · 검증은 QA 하네스 없음 → 직접 프로브.

**목표 분량 (총 산문 글자수, QA 견인 숫자 — 도달 아닌 baseline 대비 증가율·역전 해소로 판정):**

| 리포트 | 정가 | 현 실측 | 목표 |
|---|---|---|---|
| monthly | 20 | ~2,990 | **유지**(바닥, 무변경) |
| compat_social | 35 | ~1,600 | ~2,800~3,200 |
| good_days | 35 | ~1,000 | ~2,600~3,200 |
| compat | 40 | ~1,778 | ~3,000~3,400 |
| saju_full | 60 | ~4,500~5,500 | ~5,500~6,500 (완만) |

> ⚠️ LLM은 문장수 지시를 약하게 따른다(타로 스펙 실측: 목표의 ~80%에 앉음). 숫자는 상향 견인용. 판정은 **역전 해소 + baseline 대비 증가**로, 목표 정확 도달로 하지 말 것.

---

## File Structure

- `data/persona/byeolkong_fortune.md` — 전역 페르소나. 모순된 "전체 600~900자" 캡 제거(정합화). **정적블록(캐시)이라 변경 = 캐시 무효화 1회, 무해.**
- `lib/fortune/prompt.ts` — `SECTION_GUIDE`의 compat/compat_social/good_days/saju_full 필드별 문장 수 상향. monthly·daily·tarot_* 무변경.
- `lib/prompt-version.ts` — 새 dated 슬러그(코호트 분리).
- `scripts/fortune-length-probe.ts` — **신규(임시 재현 자산)**. 유료 리포트별 산문 글자수 실측.
- **무변경:** 리포트 파서(`*-report.ts`)·렌더러·타입·JSON 스키마 필드 구성·`MAX_TOKENS_BY_FORTUNE`(이미 넉넉).

---

## Task 1: 실측 프로브 + baseline

**Files:**
- Create: `scripts/fortune-length-probe.ts`

- [ ] **Step 1: 프로브 작성** — 고정 테스트 사주로 각 유료 리포트를 실제 모델(sonnet)로 생성, 산문 필드 글자수 합산 출력. `.env.local`에서 `CLAUDE_API_KEY`만 추출(값 로그 금지). `buildFortuneSystem`(순수 함수)로 system 조립 후 Anthropic SDK 직접 호출(generateOnce 래퍼 우회 — Next 런타임 의존 회피).

```ts
// scripts/fortune-length-probe.ts — TEMP 재현 자산. 실행: npx tsx scripts/fortune-length-probe.ts
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, type FortuneType } from "@/lib/fortune/types";
import type { SajuResult } from "@/lib/saju/calc";

const key = readFileSync(join(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("CLAUDE_API_KEY="))?.slice("CLAUDE_API_KEY=".length).trim();
if (!key) { console.error("no CLAUDE_API_KEY"); process.exit(1); }
const anthropic = new Anthropic({ apiKey: key });

// 고정 테스트 사주 (temporal 포함 — daily/good_days용). calcSaju 결과 형태를 하드코딩.
// 실행 시 실제 calcSaju(input) 로 교체 가능하나, 길이 측정엔 대표 fixture 로 충분.
const FIXTURE: SajuResult = /* calcSaju({year:1994,month:5,day:12,hour:9,gender:"F",inputCalendar:"solar"}) 로 채우기 */;
const FIXTURE_B: SajuResult = /* 두 번째 사람 (compat용) */;

const TYPES: FortuneType[] = ["monthly", "compat", "compat_social", "good_days", "saju_full"];
for (const type of TYPES) {
  const input = (type === "compat" || type === "compat_social")
    ? { saju: FIXTURE, sajuB: FIXTURE_B, names: { a: "가", b: "나" } }
    : { saju: FIXTURE };
  const { staticPart, dynamicPart } = buildFortuneSystem(type, input);
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: MAX_TOKENS_BY_FORTUNE[type],
    system: `${staticPart}\n\n---\n\n${dynamicPart}`,
    messages: [{ role: "user", content: FORTUNE_KICKOFF }],
  });
  const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  // 산문 글자수 = JSON 이면 문자열 값 합산, 마크다운(good_days)이면 raw 길이
  const prose = type === "good_days" ? raw.length : sumStringValues(raw);
  console.log(`${type.padEnd(14)} 정가 ${PRICE[type]}별  산문 ${prose}자`);
}

function sumStringValues(rawJson: string): number {
  try {
    const o = JSON.parse(rawJson.slice(rawJson.indexOf("{"), rawJson.lastIndexOf("}") + 1));
    let n = 0;
    const walk = (v: unknown) => {
      if (typeof v === "string") n += v.length;
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(o);
    return n;
  } catch { return rawJson.length; }
}
const PRICE: Record<string, number> = { monthly: 20, compat: 40, compat_social: 35, good_days: 35, saju_full: 60 };
```

- [ ] **Step 2: FIXTURE 채우기** — `node --import tsx -e "import('@/lib/saju/calc').then(m=>console.log(JSON.stringify(m.calcSaju({year:1994,month:5,day:12,hour:9,gender:'F',inputCalendar:'solar'}))))"` 로 실제 `SajuResult`를 찍어 `FIXTURE`에 붙여넣기(두 번째는 다른 생일로). `@/` 별칭이 tsx 에서 안 풀리면 `npx tsx` 로 실행(tsconfig paths 준수).

- [ ] **Step 3: baseline 실측** — Run: `npx tsx scripts/fortune-length-probe.ts`
Expected: 5개 유형 산문 글자수 출력. **역전 확인**(monthly 20별 > compat 40별 > good_days 35별). 이 숫자를 baseline 으로 기록(주석 또는 별도 메모).

- [ ] **Step 4: 커밋** — `git add scripts/fortune-length-probe.ts && git commit -m "chore(fortune): 리포트 분량 실측 프로브 + baseline"`

---

## Task 2: PROMPT_VERSION + 페르소나 정합화

**Files:**
- Modify: `lib/prompt-version.ts`
- Modify: `data/persona/byeolkong_fortune.md:` (핵심 원칙 5번 라인)

- [ ] **Step 1: PROMPT_VERSION 새 슬러그** — `lib/prompt-version.ts`를 읽고 기존 패턴대로 dated 슬러그 추가(예: `2026-08-10-fortune-depth`). 운세 코호트가 이 버전으로 태깅되게.

- [ ] **Step 2: 페르소나 모순 캡 제거** — `data/persona/byeolkong_fortune.md` 핵심 원칙 5번:

교체 전:
```
5. **간결하게.** 섹션당 2~4문장. 전체 600~900자. 장황하지 않게.
```
교체 후:
```
5. **분량은 리포트 형식이 정한다.** 아래 지시가 각 필드·섹션의 문장 수를 정해주니 그만큼 밀도 있게 채워 — 문장 수를 줄여 짧게 끊지 마. 단 물타기·반복·공허한 미사여구로 늘리는 건 금지(밀도로 길게, 물타기로 길게 X).
```
(현 "600~900자"는 per-type 스키마와 모순되어 모델이 무시 중 — 제거는 정합화. 이 라인이 브레비티 압력을 줄여 출력이 스키마 지시에 더 근접할 수 있음.)

- [ ] **Step 3: 빌드 확인** — Run: `npx tsc --noEmit`
Expected: 에러 0 (md·상수 변경이라 무관하지만 관례).

- [ ] **Step 4: 커밋** — `git add lib/prompt-version.ts data/persona/byeolkong_fortune.md && git commit -m "feat(fortune): 페르소나 분량 캡 정합화 + PROMPT_VERSION 범프"`

---

## Task 3: compat / compat_social 필드 문장수 상향

**Files:**
- Modify: `lib/fortune/prompt.ts` (`SECTION_GUIDE.compat`, `SECTION_GUIDE.compat_social`)

- [ ] **Step 1: compat 깊이 지시 + 문장수 상향** — `SECTION_GUIDE.compat` 편집.

`compat` 배열의 첫 지시 라인(`위 두 사람의 사주판을 바탕으로 **연애·결혼 궁합** 리포트를...`) **바로 다음 줄**에 삽입:
```
`이건 두 사람 사주를 깊이 들여다보는 프리미엄 궁합 분석이야 — 각 항목을 충분히 깊고 구체적으로 풀어. 짧게 끊지 말 것.`,
```
그리고 스키마 필드 문장수 교체:
- `"summary": "<... 3~4문장.>"` → `4~5문장`
- `"chemistry": "<... 5~6문장.>"` → `8~9문장`
- `"attraction": "<... 4~5문장.>"` → `6~7문장`
- `"conflict": "<... 4~5문장.>"` → `6~7문장`
- `"longterm": "<... 4~5문장.>"` → `6~7문장`
- `"note": "<... 2~3문장.>"` → `3~4문장`
(grade·theme·advice[3] 무변경 — 배열 길이·enum 그대로.)

- [ ] **Step 2: compat_social 동일 상향** — `SECTION_GUIDE.compat_social`에 같은 깊이 지시 라인 삽입 + summary 3~4→4~5 · chemistry 5~6→8~9 · attraction 4~5→6~7 · conflict 4~5→6~7 · longterm 4~5→6~7 · note 2~3→3~4. (연애·이성 표현 금지 규칙은 그대로.)

- [ ] **Step 3: tsc** — Run: `npx tsc --noEmit` — Expected: 에러 0.

- [ ] **Step 4: 실측** — dev 서버 재기동(프롬프트 = 모듈 캐시) 후 `npx tsx scripts/fortune-length-probe.ts`. Expected: compat ~2,800~3,400 · compat_social ~2,600~3,200. 미달이면 문장수 +1~2 재상향, 초과·패딩 느낌이면 -1. 육안으로 "물타기 아님" 확인.

- [ ] **Step 5: 커밋** — `git add lib/fortune/prompt.ts && git commit -m "feat(fortune): compat·compat_social 필드 문장수 상향 (가성비 역전 해소)"`

---

## Task 4: good_days 깊이 상향 (마크다운)

**Files:**
- Modify: `lib/fortune/prompt.ts` (`SECTION_GUIDE.good_days`)

- [ ] **Step 1: good_days 섹션 심화 + 1섹션 추가** — good_days는 마크다운이라 섹션 추가가 파서 무관(그대로 렌더). 편집:
- 첫 지시 다음 줄에 삽입: `` `이건 35별짜리 리포트야 — 각 섹션을 넉넉하고 구체적으로. 짧게 끊지 말 것.`, ``
- `## 지금 흐름` 본문 `3~4문장` → `5~6문장`
- `## 좋은 날` `좋은 날 3~5개 ... 한두 문장으로` → `좋은 날 5~7개 ... 날짜마다 2~3문장으로(그날 기운 + 이 사람에게 왜 좋은지 + 뭘 하면 좋은지)`
- `## 조심할 날` `1~2개 ... 한두 문장` → `2~3개 ... 날짜마다 2문장`
- **새 섹션 추가** (`## 조심할 날` 블록과 `## 별콩이의 한마디` 사이):
```
``,
`## 이 기운, 이렇게 살려봐`,
`이 사람의 오행 밸런스와 지금 흐름을 근거로, 앞으로 한 달 챙기면 좋은 실천 3~4가지를 구체적으로. 추상 조언 금지 — "언제·무엇을" 손에 잡히게.`,
```
- `## 별콩이의 한마디` `2~3문장` → `3~4문장`
(⚠️ 좋은 날 5~7개는 [향후 30일 일진] 목록 30개 안에서 충분 — 목록 밖 지어내기 금지 규칙 유지.)

- [ ] **Step 2: 렌더러 확인** — good_days 마크다운 렌더러가 `##` 섹션을 동적으로 렌더하는지 확인(고정 섹션명 하드코딩이면 새 섹션이 안 보임). Run: `grep -rn "지금 흐름\|좋은 날\|조심할 날" app components --include=*.tsx`. 하드코딩된 섹션 화이트리스트가 있으면 새 섹션명 추가, 없으면(동적 `##` 파싱) 무변경.

- [ ] **Step 3: 실측** — dev 재기동 후 프로브. Expected: good_days ~2,600~3,200. 미달이면 좋은 날 개수/문장수 상향.

- [ ] **Step 4: 커밋** — `git add lib/fortune/prompt.ts && git commit -m "feat(fortune): good_days 섹션 심화 + 활용법 섹션 (가성비)"`

---

## Task 5: saju_full 완만 상향

**Files:**
- Modify: `lib/fortune/prompt.ts` (`SECTION_GUIDE.saju_full`)

- [ ] **Step 1: 문장수 완만 상향** — 이미 가장 깊음(60별). 과팽창 금지, 완만하게:
- `summary` `3~4문장` → `4~5문장`
- `self.nature/strength/caution/aptitude` 각 `4~5문장` → `5~6문장`
- `self.balance.lack` `3~4문장` → `4~5문장`
- `year.flow` `5~6문장` → `6~7문장`
- `year.mind/love/relationship/career/wealth/health` 각 `4~5문장` → `5~6문장`
- `monthly[12]` `2~3문장` **유지**(12개월 = 이미 큰 총량)
- `note` `2~3문장` → `3~4문장`
(lucky·timing·actions[3] 무변경.)

- [ ] **Step 2: tsc + 실측** — `npx tsc --noEmit` (에러 0) → dev 재기동 → 프로브. Expected: saju_full ~5,500~6,500. 이미 상한(모델 순응·가독성) 근처라 목표 근접만 확인, 과도하면 -1.

- [ ] **Step 3: 커밋** — `git add lib/fortune/prompt.ts && git commit -m "feat(fortune): saju_full 완만 심화"`

---

## Task 6: 전체 사다리 확인 + 품질 스팟체크

- [ ] **Step 1: 전체 재실측** — `npx tsx scripts/fortune-length-probe.ts`. Expected: **역전 해소** = good_days·compat_social·compat 이 monthly(2,990) 이상, saju_full 최대. 대략 monthly 2,990 ≤ compat_social ~3,000 ≤ compat ~3,200 ≤ saju_full ~6,000.

- [ ] **Step 2: 품질 육안** — 프로브가 찍은 각 리포트 원문을 읽어 **밀도로 길어졌는지**(구체적 사주 근거·항목별 다른 내용) vs 물타기(반복·미사여구)인지 확인. 물타기면 해당 필드 지시에 "구체적 근거로 채우고 반복 금지" 강조 + 문장수 소폭 하향.

- [ ] **Step 3: dev 실물 1건** — dev 앱에서 compat·good_days 각 1건 실제 생성 → 렌더 화면에서 길이 체감 + 레이아웃 깨짐(긴 본문) 없는지 확인. good_days 새 섹션이 화면에 뜨는지 확인.

- [ ] **Step 4: 프로브 정리** — `scripts/fortune-length-probe.ts`는 재현 자산으로 보존(tiering-cost-reanchor.mjs 선례). baseline·최종 실측값을 파일 상단 주석에 기록.

- [ ] **Step 5: 최종 커밋 + push** — `git add -A scripts/ lib/fortune/ && git commit -m "chore(fortune): 사다리 실측 기록 + 프로브 baseline/final 주석"` → 사용자 확인 후 `git push origin dev`(dev 자동 배포).

---

## Self-Review (플랜 작성자 체크)

- **스펙 커버리지:** 스펙 §2(운세 사다리) 전부 이 플랜이 구현 — 역전 해소·정가비례·밀도 ~110-140자/별 레벨업·가독성 가드레일(Task 6 Step 3)·QA 판정(재구매율은 배포 후 코호트). ✓ 스펙 §2가 언급한 "섹션 수 상향"은 파서 번짐 회피 위해 **문장수 상향으로 대체**(good_days만 마크다운이라 섹션 1개 추가) — 설계 의도(분량↑) 동일, 기전만 최소침습.
- **플레이스홀더:** FIXTURE 채우기(Task1 Step2)는 실행 시 실제 calcSaju 출력으로 — 방법 명시함. 그 외 exact edit.
- **타입 정합:** 파서·타입·스키마 필드 무변경(문장수는 프롬프트 문자열 안 지시라 타입 무관). good_days 새 섹션만 렌더러 확인(Task4 Step2)으로 정합 보장.

---

## 판정 (배포 후, 별도)

새 `PROMPT_VERSION` 코호트 전후 비교: 운세 재구매율 · 결과 열람율 · 실측 분량(역전 해소). roadmap ④ prod 배포에 포함. 관련 스펙 `2026-08-10-재화-분량-턴수-정합성-design.md` §2·§6.
