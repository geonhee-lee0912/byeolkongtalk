# 모델 티어링 라우팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지면·task 종류별로 모델을 배치한다 — 멀티턴 chat(고민톡·연애·시뮬)=luna, 무료 데일리 운세=nano/mini, 엄격-형식 유료 리포트=sonnet 유지. 인프라는 이미 있고(streamChat/generateOnce 의 `model?`), 이 플랜은 정책 배선 + luna 타로 프롬프트 튜닝 + 지면별 QA 게이트다.

**Architecture:** chat 표준 모델은 `CHAT_MODEL`(model-registry) 상수, fortune 타입별 모델은 `fortuneModel()`(lib/fortune). 6개 streamChat 호출부와 fortune generateOnce 호출부가 해당 모델을 5번째 인자로 넘긴다. `DEFAULT_CHAT_MODEL` 은 sonnet 안전폴백 유지. 사주 chat 은 폐쇄라 미배선. luna 는 고민톡에서만 검증됐으므로 연애·시뮬은 QA 통과 후에만 flip.

**Tech Stack:** Next.js 16 / TS strict / `@anthropic-ai/sdk`·`openai`·`@google/genai` / **테스트 = `node:test`** (`node --import tsx --test`, import 는 명시 `.ts` 확장자, `import { test } from "node:test"` + `node:assert/strict`). QA 하네스 = 로컬 dev 서버 + `qa/`.

**정본 spec:** `docs/superpowers/specs/2026-08-10-model-tiering-routing-design.md`

**⚠️ QA 게이트 실행 규약(Task 4~7 공통):** QA_CHAT_MODEL 은 **dev 서버 env** 에 걸어야 서버가 읽는다(하네스 아님). 절차: `.env.local` 에 `QA_CHAT_MODEL=<model>` 추가 → dev 서버 **재기동** → `node --import tsx --env-file=.env.local qa/run.ts ...` → 끝나면 `.env.local` 에서 제거. 6케이스 런 1회 >10분(유료). 판정 = 객관 단언(형식·[END]·[CARD]) + 트랜스크립트 직접 읽기(pairwise 수치 맹신 금지).

---

## File Structure

- Create `lib/fortune/model.ts` — `FORTUNE_CHEAP_MODEL` + `fortuneModel(type)`.
- Create `lib/fortune/model.test.ts` — fortuneModel 매핑 유닛.
- Modify `lib/claude/model-registry.ts` — `CHAT_MODEL` 상수 추가.
- Modify `lib/claude/model-registry.test.ts` — `CHAT_MODEL` 이 등록 모델인지 단언.
- Modify `app/api/consultations/tarot/chat/route.ts:253` — streamChat 에 `CHAT_MODEL`.
- Modify `app/api/relationship/chat/route.ts:387,506,629` — streamChat 3곳에 `CHAT_MODEL`.
- Modify `app/api/relationship/sim/chat/route.ts:211,248` — streamChat 2곳에 `CHAT_MODEL`.
- Modify `app/api/fortune/create/route.ts` — generateOnce 호출부(초기+재시도)에 `fortuneModel(cfg.type)`.
- Modify `data/persona/byeolkong_tarot.md` — 🃏💫🔗 라벨 강제를 소형 스프레드로 확장 + 마크다운 억제.
- **미변경:** `app/api/consultations/saju/chat/route.ts`(폐쇄), `lib/sensitive.ts`(안전), haiku 유틸.

---

## Task 1: 모델 정책 상수/헬퍼 (CHAT_MODEL + fortuneModel)

**Files:**
- Create: `lib/fortune/model.ts`
- Test: `lib/fortune/model.test.ts`
- Modify: `lib/claude/model-registry.ts`, `lib/claude/model-registry.test.ts`

- [ ] **Step 1: fortuneModel 실패 테스트 작성**

```ts
// lib/fortune/model.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fortuneModel, FORTUNE_CHEAP_MODEL } from "./model.ts";

describe("fortuneModel", () => {
  it("무료 데일리는 저가 모델", () => {
    assert.equal(fortuneModel("daily"), FORTUNE_CHEAP_MODEL);
    assert.equal(fortuneModel("tarot_daily"), FORTUNE_CHEAP_MODEL);
  });
  it("유료 리포트는 sonnet", () => {
    for (const t of ["monthly", "saju_full", "compat", "compat_social", "good_days"] as const) {
      assert.equal(fortuneModel(t), "claude-sonnet-5");
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --import tsx --test lib/fortune/model.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: fortuneModel 구현**

```ts
// lib/fortune/model.ts
// fortune one-shot 모델 정책: 무료 데일리는 최저가, 유료 리포트는 sonnet(엄격-형식 신뢰성).
// spec 2026-08-10-model-tiering-routing-design.md §2.
import type { FortuneType } from "./types.ts";

// 무료 데일리 저가 모델. QA(Task 7)로 nano 품질 확인 후, 불충분하면 "gpt-5-mini" 로 교체.
export const FORTUNE_CHEAP_MODEL = "gpt-5-nano";

export function fortuneModel(type: FortuneType): string {
  return type === "daily" || type === "tarot_daily" ? FORTUNE_CHEAP_MODEL : "claude-sonnet-5";
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --import tsx --test lib/fortune/model.test.ts` → PASS.

- [ ] **Step 5: CHAT_MODEL 상수 + 단언 추가**

`lib/claude/model-registry.ts` 의 `DEFAULT_CHAT_MODEL` 선언 바로 아래에 추가:

```ts
// chat 지면(고민톡·연애·시뮬) 표준 모델. 미래 프리미엄 티어는 여기서 분기.
// DEFAULT_CHAT_MODEL 은 sonnet 안전폴백으로 유지(model 미배선 호출부 보호).
export const CHAT_MODEL = "gpt-5.6-luna";
```

`lib/claude/model-registry.test.ts` 의 `describe("model-registry", ...)` 안에 케이스 추가:

```ts
  it("CHAT_MODEL 은 등록된 openai 모델", () => {
    assert.equal(providerOf(CHAT_MODEL), "openai");
  });
```

그리고 같은 파일 import 에 `CHAT_MODEL` 추가: `import { providerOf, resolveChatModel, CHAT_MODEL } from "./model-registry.ts";`

- [ ] **Step 6: 통과 + tsc** — Run: `node --import tsx --test lib/claude/model-registry.test.ts` → PASS. `npx tsc --noEmit` → 통과.

- [ ] **Step 7: Commit**

```bash
git add lib/fortune/model.ts lib/fortune/model.test.ts lib/claude/model-registry.ts lib/claude/model-registry.test.ts
git commit -m "feat(model-router): 티어링 정책 상수 CHAT_MODEL + fortuneModel"
```

---

## Task 2: chat 라우트 배선 (luna) — 6개 호출부

**Files:**
- Modify: `app/api/consultations/tarot/chat/route.ts:253`
- Modify: `app/api/relationship/chat/route.ts:387,506,629`
- Modify: `app/api/relationship/sim/chat/route.ts:211,248`

⚠️ 라우트당 streamChat 이 여러 개다(relationship 3·sim 2). **전부** 배선해야 하나라도 sonnet 으로 안 새어나간다. saju chat 은 폐쇄라 **건드리지 않는다**.

- [ ] **Step 1: 각 파일에 CHAT_MODEL import 추가**

세 파일 상단 import 블록에:
```ts
import { CHAT_MODEL } from "@/lib/claude/model-registry";
```
(tarot·sim 은 streamChat import 근처에. relationship 도 동일. 이미 다른 걸 model-registry 에서 import 중이면 병합.)

- [ ] **Step 2: tarot chat — streamChat 5번째 인자 추가** (`route.ts:253`)

`streamChat(systemMessage, apiMessages, maxTokens, { route: ..., userId, extra: {...} })` 의 닫는 `)` 앞에 `, CHAT_MODEL` 추가:
```ts
        for await (const chunk of streamChat(systemMessage, apiMessages, maxTokens, {
          route: "/api/consultations/tarot/chat",
          userId,
          extra: { readingId: reading.id },
        }, CHAT_MODEL)) {
```

- [ ] **Step 3: relationship chat — 3곳 배선** (`:387, :506, :629`)

각 streamChat 호출의 마지막 인자(logCtx) 뒤에 `, CHAT_MODEL`:
- `:387` `streamChat(systemMessage, apiMessages, DRAW_MAX_TOKENS, drawLogCtx, CHAT_MODEL)`
- `:506` `streamChat(systemMessage, apiMessages, 1400, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "skillStart" } }, CHAT_MODEL)`
- `:629` `streamChat(systemMessage, split.apiMessages, 1400, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, threadReadingId, inVerdict } }, CHAT_MODEL)`

- [ ] **Step 4: sim chat — 2곳 배선** (`:211, :248`)

- `:211` `streamChat(system, split.apiMessages, DOLL_MAX_TOKENS, logCtx, CHAT_MODEL)`
- `:248` `streamChat(system, messages, maxTokens, logCtx, CHAT_MODEL)`

- [ ] **Step 5: tsc + 배선 누락 감사**

Run: `npx tsc --noEmit` → 통과.
Run(누락 확인 — CHAT_MODEL 없는 streamChat 이 chat 라우트에 남았는지):
`grep -rn "streamChat(" app/api/consultations/tarot app/api/relationship | grep -v CHAT_MODEL`
Expected: 빈 출력(사주 제외 전부 배선됨). saju chat 은 대상 아님.

- [ ] **Step 6: Commit**

```bash
git add app/api/consultations/tarot/chat/route.ts app/api/relationship/chat/route.ts app/api/relationship/sim/chat/route.ts
git commit -m "feat(model-router): chat 라우트(고민톡·연애·시뮬) luna 배선"
```

---

## Task 3: fortune 라우트 배선 (무료→cheap / 유료→sonnet)

**Files:**
- Modify: `app/api/fortune/create/route.ts` (generateOnce 초기 `:414` + 재시도 `:432,453,475,495,515`)

- [ ] **Step 1: fortuneModel import 추가**

`route.ts` 상단, `generateOnce` import(`import { generateOnce } from "@/lib/claude";`) 근처에:
```ts
import { fortuneModel } from "@/lib/fortune/model";
```

- [ ] **Step 2: 모든 generateOnce 호출에 5번째 인자 추가**

`generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type], fortuneLogCtx)` → 끝에 `, fortuneModel(cfg.type)` 추가. 초기 호출(`:414`)과 타입별 재시도 5곳(`:432,453,475,495,515`) **전부**. 예:
```ts
      report = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type], fortuneLogCtx, fortuneModel(cfg.type));
```

- [ ] **Step 3: tsc + 누락 감사**

Run: `npx tsc --noEmit` → 통과.
Run: `grep -n "generateOnce(" app/api/fortune/create/route.ts | grep -v "fortuneModel"`
Expected: 빈 출력(모든 generateOnce 배선됨).

- [ ] **Step 4: Commit**

```bash
git add app/api/fortune/create/route.ts
git commit -m "feat(model-router): fortune 배선 — 무료 데일리→cheap, 유료 리포트→sonnet"
```

---

## Task 4: luna 타로 프롬프트 튜닝 + 고민톡 QA 게이트

**Files:**
- Modify: `data/persona/byeolkong_tarot.md`

⚠️ **타로 도메인 파일만** — 코어(byeolkong_core.md) 편집 금지(전 종목 회귀). 캘리브레이션 실측: luna 첫 풀이는 소울은 sonnet급이나 ①🃏💫🔗 3라벨 골격을 소형 스프레드(고민톡 3카드)에서 생략(현 프롬프트가 "5장 이상"만 강제해 sonnet 은 자발 적용·luna 는 미적용) ②`**볼드**` 마크다운 사용.

- [ ] **Step 1: 라벨 골격 강제를 멀티카드(2장+) 전체로 확장**

`byeolkong_tarot.md` 의 `**5장 이상 스프레드는 카드마다 아래 3줄 라벨 골격을 그대로 출력해**` 로 시작하는 문장에서 **"5장 이상"을 "2장 이상(멀티카드)"** 로 바꾼다. (원카드는 라벨 없이 산문 유지 — 단일 카드엔 포지션-연결 골격이 과함.) 나머지 문장은 그대로.

- [ ] **Step 2: 마크다운 억제 지시 추가**

같은 §(타로 풀이 출력 구조) 끝에 한 줄 추가:
```
- ⚠️ 마크다운 강조(`**볼드**`, `#헤더`)는 쓰지 마 — 결과 화면이 평문 렌더라 별표가 그대로 노출돼. 강조는 문장으로.
```

- [ ] **Step 3: dev 서버 재시작(모듈 캐시)** — 프롬프트 수정 후 QA 전 필수(AGENTS.md).

- [ ] **Step 4: 고민톡 luna QA (게이트)**

`.env.local` 에 `QA_CHAT_MODEL=gpt-5.6-luna` 추가 → dev 서버 재기동 → Run:
`node --import tsx --env-file=.env.local qa/run.ts --case=tarot.real`
Expected/판정:
- 첫 풀이(turn0)에 카드마다 🃏💫🔗 3라벨 출력(3카드 포함). `qa/out/<ts>/*.json` 의 turn0 assistantText 육안 확인.
- `**` 리터럴 미노출(마크다운 억제 확인).
- 객관 단언: `card_name_before_marker`·`no_consecutive_question_close` 실패 0 유지(캘리브레이션 baseline).
- 실패 시(luna 가 라벨 미준수/과다) Step 1~2 문구 보정 후 재실행. 통과까지 반복.

- [ ] **Step 5: `.env.local` 원복** — `QA_CHAT_MODEL` 제거.

- [ ] **Step 6: Commit**

```bash
git add data/persona/byeolkong_tarot.md
git commit -m "feat(model-router): luna 타로 프롬프트 튜닝 — 🃏💫🔗 멀티카드 확장 + 마크다운 억제"
```

---

## Task 5: QA 게이트 — 연애 상담 (luna)

**Files:** (코드 변경 없음 — 검증 게이트)

⚠️ luna 는 고민톡에서만 검증됨. 연애 상담은 다른 페르소나(기억·스킬·R1~R4)라 별도 검증. 열세면 flip 보류.

- [ ] **Step 1: luna 로 relationship QA**

`.env.local` 에 `QA_CHAT_MODEL=gpt-5.6-luna` → dev 서버 재기동 → Run:
`node --import tsx --env-file=.env.local qa/run.ts --product=relationship`
Expected/판정(객관 단언 + 직접 읽기):
- R1~R4 준수(없는 판 안 지어냄·인접주제 관계렌즈·복귀 안부·[END]/종결 마커 없음).
- `[SKILL:...]` 마커 정상, 스레드 무종결.
- 트랜스크립트 육안 = 별콩이 화법 유지.

- [ ] **Step 2: 기준선 대조(선택)** — 필요 시 sonnet baseline(`QA_CHAT_MODEL` 없이) 런 후 `qa/compare.ts` 로 전체대화 pairwise. **수치보다 객관 단언·직접 읽기 우선.**

- [ ] **Step 3: 판정 기록 + `.env.local` 원복**

통과 → 연애 상담 luna 확정(Task 2 배선 그대로 유효). 열세 → 이 지면만 sonnet 유지하도록 `app/api/relationship/chat/route.ts` 의 CHAT_MODEL 을 되돌리고 spec §8 에 기록. **판정 결과를 메모리 `model-router-qa-progress` 에 append.**

---

## Task 6: QA 게이트 — 시뮬 (luna)

**Files:** (코드 변경 없음 — 검증 게이트)

- [ ] **Step 1: luna 로 sim QA**

`.env.local` `QA_CHAT_MODEL=gpt-5.6-luna` → 재기동 → Run: `npm run qa:sim`
(sim 전용 러너 — `qa/sim/run-sim.ts`. `--case` 필터 지원 여부는 파일 확인 후 사용.)
Expected/판정:
- 몰입 유지(HIDE_SHELL 라우트 톤)·doll_partner 코어 미계승(별콩이 코어 화법 누출 없음)·소프트수렴 제거 반영.
- 자유쓰기 custom·답변추천 흐름 정상.
- 트랜스크립트 육안.

- [ ] **Step 2: 판정 + 원복** — 통과 → 시뮬 luna 확정. 열세 → sim 라우트만 sonnet 되돌림 + 기록. 메모리 append.

---

## Task 7: QA 게이트 — 무료 데일리 nano vs mini (one-shot)

**Files:**
- (조건부) Modify: `lib/fortune/model.ts` (`FORTUNE_CHEAP_MODEL` 확정)

⚠️ fortune 는 chat 하네스로 안 돌아간다(generateOnce). one-shot 비교 스크립트로 검증. 데일리는 단발이라 mini 의 멀티턴 약점 무관.

- [ ] **Step 1: one-shot 비교 스크립트 작성** (프로젝트 루트 임시, 검증 후 삭제)

```js
// _fortune_daily_probe.mjs — 실행: node --env-file=.env.local _fortune_daily_probe.mjs
import { generateOnce } from "./lib/claude.ts"; // tsx 필요 → 아래 실행법 참고
```
⚠️ generateOnce 는 TS(`@/` alias) 라 순수 .mjs import 불가. 대신 `qa/` 스타일로 **tsx** 실행하는 임시 스크립트를 `qa/_fortune-daily-probe.ts` 에 두고 `buildFortuneSystemMessage`(lib/fortune/prompt.ts) + `generateOnce` 를 직접 호출:

```ts
// qa/_fortune-daily-probe.ts (검증 후 삭제)
import { generateOnce } from "../lib/claude.ts";
import { FORTUNE_CONFIG } from "../lib/fortune/types.ts";
// buildFortuneSystemMessage 의 실제 시그니처는 lib/fortune/prompt.ts 확인 후 맞출 것.
// 목표: daily 타입 system + FORTUNE_KICKOFF 로 nano·mini 각각 generateOnce 호출해 출력 대조.
for (const model of ["gpt-5-nano", "gpt-5-mini"]) {
  const out = await generateOnce(/* daily system */ "", [{ role: "user", content: "" }], 3380, undefined, model);
  console.log(`\n===== ${model} (len ${out.length}) =====\n` + out.slice(0, 600));
}
```
(실제 daily system 프롬프트 조립은 `app/api/fortune/create/route.ts` 의 daily 분기 + `lib/fortune/prompt.ts` 를 참고해 재현. 정확한 함수명·인자는 그 파일에서 확인.)

- [ ] **Step 2: 실행 + 대조**

Run: `node --import tsx --env-file=.env.local qa/_fortune-daily-probe.ts`
판정: nano 출력이 데일리 운세로 품질·형식 충분한가(따뜻·일관·잘림 없음). 육안 대조.
- nano 충분 → `FORTUNE_CHEAP_MODEL="gpt-5-nano"` 유지.
- nano 불충분(품질/형식 붕괴) → `lib/fortune/model.ts` 의 `FORTUNE_CHEAP_MODEL="gpt-5-mini"` 로 변경.

- [ ] **Step 3: 임시 스크립트 삭제 + (변경 시) 커밋**

```bash
rm -f qa/_fortune-daily-probe.ts
# FORTUNE_CHEAP_MODEL 변경했으면:
git add lib/fortune/model.ts && git commit -m "fix(model-router): 무료 데일리 모델 확정 (QA 결과)"
```

---

## Task 8: 유료 리포트 회귀 + 최종 검증

**Files:** (검증 위주)

- [ ] **Step 1: fortune 유료 리포트 sonnet 회귀 확인**

유료 리포트(monthly/saju_full/compat/compat_social/good_days)는 `fortuneModel` 이 `claude-sonnet-5` 를 반환해 **모델 불변**. 스모크로 파싱 성공 확인(1개면 충분):
`.env.local` 에 QA_CHAT_MODEL 없음 확인 → dev 서버 → `/fortune/monthly` 등 1개 실제 생성(또는 기존 생성 경로) → 리포트 정상 파싱(에러 없음).

- [ ] **Step 2: 전체 유닛 회귀 + tsc**

Run: `npx tsc --noEmit` → 통과.
Run(CI 등가, qa·워크트리 제외): `node --import tsx --test $(find . -name "*.test.ts" -not -path "./node_modules/*" -not -path "./qa/*" -not -path "./.claude/*")`
Expected: 전 유닛 PASS(fortuneModel·CHAT_MODEL 신규 포함), 회귀 0.

- [ ] **Step 3: 최종 상태 확인**

Run: `git status` → clean(커밋 완료). `git log --oneline -8` 로 Task 1~7 커밋 확인.

- [ ] **Step 4: 배포 노트** — prod 는 **로드맵 ④(dev 누적분 한 판)** 시 배치. 선행 미push(어댑터 reasoning_effort·compare 방법론·이 플랜 커밋들) 함께 push. push 후 `/admin/errors`·원가 대시보드로 파싱실패·원가 절감 관측.

---

## Self-Review

**1. Spec coverage:**
- spec §1 라우팅 맵 → Task 2(chat luna)·Task 3(fortune)·Task 4(타로 튜닝) ✅. 사주 chat 제외 = Task 2 에서 미배선 명시 ✅.
- spec §2 정책 위치(CHAT_MODEL registry·fortuneModel lib/fortune·DEFAULT sonnet·QA 오버라이드) → Task 1 ✅.
- spec §3 luna 타로 프롬프트(🃏💫🔗+마크다운) → Task 4 ✅.
- spec §4 지면별 QA 게이트(고민톡·연애·시뮬·무료데일리·유료회귀) → Task 4·5·6·7·8 ✅.
- spec §6 비스코프(haiku·민감·사주 chat) → 미변경 명시 ✅.
- spec §7 성공기준 → Task 4~8 판정 ✅.

**2. Placeholder scan:** Task 7 의 스크립트는 "정확한 함수명은 lib/fortune/prompt.ts 확인" 지시 — 이는 fortune system 조립부가 그 파일에 있고 실행자가 재현해야 하는 실재 코드 참조(추측 금지 지시)지 모호 플레이스홀더 아님. 나머지 스텝은 완전 코드·명령.

**3. Type consistency:** `CHAT_MODEL`(Task1)=문자열 상수 → Task2 6곳 사용 일관. `fortuneModel(cfg.type)`(Task1)=`FortuneType→string` → Task3 사용 일관. `FORTUNE_CHEAP_MODEL`(Task1) → Task7 조정 일관. streamChat/generateOnce 5번째 인자 `model?:string` 계약과 일치.

**미해결 확인(실행 시):** `buildFortuneSystemMessage` 등 fortune system 조립 함수 시그니처(Task7) · relationship/sim QA 케이스 필터 지원(Task5·6) — 실행자가 해당 파일 읽고 확인.
