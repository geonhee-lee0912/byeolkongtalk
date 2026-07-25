# 스킬 인-스레드 Phase 3 (카드뽑기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "우리 사이" 카드뽑기 스킬(`checkin`·`deep_feelings`)을 별도 화면/별도 reading 없이 연애 상담 스레드 안에서 완결 — 여백 모달에서 카드 뽑기 → 45/40⭐ → 같은 스레드에 카드 스트립 + 풀이 스트리밍 → 캡 면제 턴(10/8)으로 자유 대화 연속. 이동형이 사라지므로 복귀 인사(recap) 체인도 일괄 제거.

**Architecture:** Phase 1(verdict 스트림) / Phase 2(compat JSON)의 `skillStart` 분기를 tarot_draw로 확장. tarot_draw는 **원샷 스트림** — 클라가 뽑은 카드를 서버가 위조 검증(label 재계산) → 차감 → 인-플라이트 락 → **카드 스트립 메시지 선저장** → 관계 페르소나 + 드로우 가이드 + 카드 블록으로 SSE 1턴(2800토큰) → 풀이 저장 + `skill_log` + 그레이스 적립 + 락 해제. `[END]`·턴캡·`WRAP_THRESHOLDS` 없음. 그레이스는 기존 `messages.skill_key` 제외 기계장치(`getTodayThreadTurns`)를 재사용한다.

**Tech Stack:** Next.js 16 (App Router, `runtime="nodejs"`), TypeScript strict, Supabase(service role), Anthropic SDK(`streamChat` + `cache_control`). 테스트: `node:test` + `tsx`(순수 함수). 검증: `npx tsc --noEmit` + `npx next build` + 런타임 스모크 + 브라우저 E2E(dev). **마이그레이션 없음.**

**스펙:** `docs/superpowers/specs/2026-07-25-스킬-스레드내-phase3-카드뽑기.md`

---

## 파일 구조 (생성/수정/삭제)

**생성**
- `lib/relationship/draw-thread.ts` — 인-스레드 드로우 순수 함수 5개(직렬화·파싱·카드 검증·모델 맥락 치환·`[CARD:n]` 분할)
- `lib/relationship/draw-thread.test.ts` — 위 유닛 테스트
- `data/persona/byeolkong_relationship_draw.md` — 인-스레드 카드 풀이 가이드(프롬프트)
- `components/relationship/ThreadCardStrip.tsx` — 스레드 카드 스트립(다크 패널 + `CardSpreadView` 재사용)
- `components/relationship/ThreadDrawModal.tsx` — 가장자리 여백 모달 + `CardDrawRitual` + `StarConfirmModal`

**수정**
- `lib/relationship/skills.ts` — `graceTurns` 필드 추가 / `buildSkillRecapText` 제거
- `lib/relationship/types.ts` — `skill_grace` 추가 / `pending_skill_recap`·`RelSkillMarker`·`REL_SKILL_KEY` 제거
- `lib/relationship/memory.ts` — `grantSkillGrace`/`consumeSkillGrace` 추가 / `applySkillToMemo` 제거
- `lib/claude.ts` — `formatDrawnCardsBlock` export + `RelationshipTurnContext.drawContext` + 드로우 가이드 주입
- `app/api/relationship/chat/route.ts` — tarot_draw `skillStart` 분기 + 일반 경로 그레이스 소진 + 스트립 치환
- `components/relationship/ThreadChat.tsx` — 모달 오픈/제출 + 스트립·칩 렌더 + `drawLoading` / recap 이펙트 제거
- `app/relationship/page.tsx` — `recap` 제거
- `app/api/relationship/route.ts` — GET `recap` 제거
- `lib/relationship/useSkillLaunch.ts` — tarot_draw → `onInThreadSkill`, `launchTarotDraw` 제거
- `app/tarot/draw/page.tsx` — 관계 스킬 분기 전체 제거
- `app/api/consultations/tarot/route.ts` — 관계 태깅 제거
- `app/api/consultations/tarot/chat/route.ts` — `logSkillToThread` 호출 제거
- `data/persona/byeolkong_relationship.md` — §스킬 제안 인-스레드 통일
- `lib/analytics/aggregate.ts` — source 케이스 2줄

**삭제**
- `app/api/relationship/recap-seen/route.ts`
- `lib/relationship/skill-log.ts`

---

## Task 1: `draw-thread.ts` 순수 함수 5개 (TDD)

인-스레드 드로우의 모든 순수 로직을 한 파일에 모은다. 스트립 메시지 직렬화/파싱(compat의 `serializeCompatReport`/`tryParseStoredCompatReport`와 같은 역할), 카드 위조 검증(서버 권위), 모델 맥락 치환, `[CARD:n]` 단락 분할.

**Files:**
- Create: `lib/relationship/draw-thread.ts`
- Create: `lib/relationship/draw-thread.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/relationship/draw-thread.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeThreadDraw,
  tryParseThreadDraw,
  validateDrawnCards,
  redactDrawForModel,
  splitByCardMarker,
} from "./draw-thread.ts";
import type { ThreadMsg } from "./memory.ts";

const labels = ["지금의 나", "지금의 상대", "둘 사이 에너지", "내가 필요한 것", "상대가 필요한 것", "나아갈 방향"];
const cards = labels.map((label, i) => ({ card_id: i + 1, direction: "upright" as const, label }));

test("serializeThreadDraw ↔ tryParseThreadDraw 왕복", () => {
  const raw = serializeThreadDraw({ skill: "checkin", spread: "checkin_6", cards });
  const parsed = tryParseThreadDraw(raw);
  assert.ok(parsed);
  assert.equal(parsed.skill, "checkin");
  assert.equal(parsed.spread, "checkin_6");
  assert.equal(parsed.cards.length, 6);
  assert.equal(parsed.cards[0].label, "지금의 나");
});

test("tryParseThreadDraw — 일반 텍스트/다른 JSON은 null", () => {
  assert.equal(tryParseThreadDraw("그냥 평범한 답장이야."), null);
  assert.equal(tryParseThreadDraw('{"v":1,"grade":"좋은 인연"}'), null);
});

test("validateDrawnCards — 정상 입력은 label 을 서버 값으로 재계산", () => {
  const input = cards.map((c) => ({ ...c, label: "위조된라벨" }));
  const out = validateDrawnCards(input, 6, labels);
  assert.ok(out);
  assert.equal(out[0].label, "지금의 나");
  assert.equal(out[5].label, "나아갈 방향");
});

test("validateDrawnCards — 장수 불일치/중복/잘못된 방향/미존재 카드는 null", () => {
  assert.equal(validateDrawnCards(cards.slice(0, 5), 6, labels), null);
  const dup = [...cards.slice(0, 5), { ...cards[0] }];
  assert.equal(validateDrawnCards(dup, 6, labels), null);
  const badDir = cards.map((c, i) => (i === 0 ? { ...c, direction: "sideways" } : c));
  assert.equal(validateDrawnCards(badDir, 6, labels), null);
  const badId = cards.map((c, i) => (i === 0 ? { ...c, card_id: 9999 } : c));
  assert.equal(validateDrawnCards(badId, 6, labels), null);
  assert.equal(validateDrawnCards("not-an-array", 6, labels), null);
});

test("redactDrawForModel — 스트립 JSON 을 짧은 자연어로 치환(role·길이 불변)", () => {
  const rows: ThreadMsg[] = [
    { role: "user", content: "카드 뽑아줄래?" },
    { role: "assistant", content: serializeThreadDraw({ skill: "checkin", spread: "checkin_6", cards }) },
  ];
  const out = redactDrawForModel(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].content, "카드 뽑아줄래?");
  assert.equal(out[1].role, "assistant");
  assert.ok(!out[1].content.startsWith("{"));
  assert.ok(out[1].content.includes("6장"));
});

test("splitByCardMarker — [CARD:n] 기준 분할 + 마커 제거", () => {
  const text = "펼쳐볼게.\n\n[CARD:1]\n첫 자리는 이래.\n\n[CARD:2]\n둘째 자리는 이래.";
  const segs = splitByCardMarker(text);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].cardIndex, null);
  assert.equal(segs[0].text, "펼쳐볼게.");
  assert.equal(segs[1].cardIndex, 1);
  assert.ok(segs[1].text.includes("첫 자리"));
  assert.ok(!segs[1].text.includes("[CARD:"));
  assert.equal(segs[2].cardIndex, 2);
});

test("splitByCardMarker — 마커 없으면 단일 세그먼트", () => {
  const segs = splitByCardMarker("마커 없는 평범한 답장");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].cardIndex, null);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --import tsx --test lib/relationship/draw-thread.test.ts`
Expected: FAIL — 모듈 없음 (`Cannot find module './draw-thread.ts'`)

- [ ] **Step 3: 구현**

`lib/relationship/draw-thread.ts`:

```ts
// lib/relationship/draw-thread.ts — 인-스레드 카드뽑기(Phase 3) 순수 로직.
// 스레드에 저장되는 "카드 스트립" 메시지의 직렬화/파싱, 클라가 보낸 카드의 위조 검증(서버 권위),
// 모델 최근창용 치환, 풀이 텍스트의 [CARD:n] 단락 분할.
import { getCard } from "@/lib/tarot/cards";
import type { DrawnCard, SpreadType } from "@/lib/tarot/spreads";
import type { ThreadMsg } from "./memory";

export interface ThreadDraw {
  v: 1;
  skill: string;
  spread: SpreadType;
  cards: DrawnCard[];
}

/** 스트립 메시지 content 직렬화 (assistant 메시지 1건에 그대로 저장). */
export function serializeThreadDraw(input: {
  skill: string;
  spread: SpreadType;
  cards: DrawnCard[];
}): string {
  const payload: ThreadDraw = { v: 1, skill: input.skill, spread: input.spread, cards: input.cards };
  return JSON.stringify(payload);
}

/** 메시지 content 가 스트립이면 파싱, 아니면 null. (렌더 분기 판정용) */
export function tryParseThreadDraw(raw: string): ThreadDraw | null {
  const s = raw.trim();
  if (!s.startsWith("{")) return null;
  try {
    const o = JSON.parse(s) as Partial<ThreadDraw>;
    if (o?.v !== 1) return null;
    if (typeof o.skill !== "string" || typeof o.spread !== "string") return null;
    if (!Array.isArray(o.cards) || o.cards.length === 0) return null;
    return o as ThreadDraw;
  } catch {
    return null;
  }
}

/** 클라가 보낸 drawnCards 검증. 통과하면 label 을 서버 labels 로 재계산해 반환, 실패 시 null. */
export function validateDrawnCards(
  input: unknown,
  cardCount: number,
  labels: string[]
): DrawnCard[] | null {
  if (!Array.isArray(input) || input.length !== cardCount) return null;
  if (labels.length !== cardCount) return null;
  const seen = new Set<number>();
  const out: DrawnCard[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i] as { card_id?: unknown; direction?: unknown };
    const id = c?.card_id;
    if (typeof id !== "number" || !Number.isInteger(id)) return null;
    if (seen.has(id)) return null;
    if (!getCard(id)) return null;
    if (c?.direction !== "upright" && c?.direction !== "reversed") return null;
    seen.add(id);
    out.push({ card_id: id, direction: c.direction, label: labels[i] });
  }
  return out;
}

/** 스트립 JSON assistant 메시지를 짧은 자연어로 치환(모델이 JSON 을 되뇌지 않게).
 *  role·길이 불변 — 치환이지 필터 아님. 카드 내용은 system 의 [뽑은 카드] 블록으로 들어간다. */
export function redactDrawForModel(rows: ThreadMsg[]): ThreadMsg[] {
  return rows.map((m) => {
    if (m.role !== "assistant") return m;
    const draw = tryParseThreadDraw(m.content);
    if (!draw) return m;
    return {
      role: "assistant",
      content: `(별콩이가 카드를 ${draw.cards.length}장 뽑아서 펼쳐봤어)`,
    };
  });
}

export interface CardSegment {
  /** 1-based 카드 번호. null = 마커 이전(도입부) 세그먼트 */
  cardIndex: number | null;
  text: string;
}

/** 풀이 텍스트를 [CARD:n] 기준으로 분할하고 마커를 제거. 빈 세그먼트는 버린다. */
export function splitByCardMarker(raw: string): CardSegment[] {
  const re = /\[CARD:(\d+)\]/g;
  const segs: CardSegment[] = [];
  let lastIndex = 0;
  let current: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const chunk = raw.slice(lastIndex, m.index).trim();
    if (chunk) segs.push({ cardIndex: current, text: chunk });
    current = Number(m[1]);
    lastIndex = m.index + m[0].length;
  }
  const tail = raw.slice(lastIndex).trim();
  if (tail) segs.push({ cardIndex: current, text: tail });
  return segs.length > 0 ? segs : [{ cardIndex: null, text: raw.trim() }];
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --import tsx --test lib/relationship/draw-thread.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/relationship/draw-thread.ts lib/relationship/draw-thread.test.ts
git commit -m "feat(relationship): 인-스레드 드로우 순수 로직(직렬화·카드 검증·치환·마커 분할) + 테스트"
```

---

## Task 2: 그레이스 턴 — 레지스트리 필드 + memo 순수 함수 (TDD)

"대화 분량까지 산 것"을 보전하는 캡 면제 턴. 적립은 누적(재구매 시 합산), 소진은 왕복당 1턴, 0이 되면 `null`로 전이. 캡 제외는 기존 `getTodayThreadTurns`(user 메시지 중 `skill_key IS NULL`만 카운트)가 자동 처리하므로 순수 함수는 카운터만 관리한다.

**Files:**
- Modify: `lib/relationship/types.ts:51-59`
- Modify: `lib/relationship/skills.ts:7-18`(인터페이스), `:20-42`(항목)
- Modify: `lib/relationship/memory.ts` (`appendSkillLog` 아래에 추가)
- Create: `lib/relationship/grace.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/relationship/grace.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { grantSkillGrace, consumeSkillGrace } from "./memory.ts";
import { getSkill } from "./skills.ts";
import type { RelationshipMemo } from "./types.ts";

test("레지스트리 — 카드뽑기 스킬에 graceTurns 설정", () => {
  assert.equal(getSkill("checkin")?.graceTurns, 10);
  assert.equal(getSkill("deep_feelings")?.graceTurns, 8);
});

test("grantSkillGrace — 최초 적립", () => {
  const out = grantSkillGrace({}, "checkin", 10);
  assert.deepEqual(out.skill_grace, { key: "checkin", remaining: 10 });
});

test("grantSkillGrace — 잔여에 누적 가산 + key 는 최신 스킬로", () => {
  const memo: RelationshipMemo = { skill_grace: { key: "checkin", remaining: 3 } };
  const out = grantSkillGrace(memo, "deep_feelings", 8);
  assert.deepEqual(out.skill_grace, { key: "deep_feelings", remaining: 11 });
});

test("grantSkillGrace — turns 0 이하면 변화 없음", () => {
  assert.equal(grantSkillGrace({}, "compat", 0).skill_grace ?? null, null);
});

test("consumeSkillGrace — 1턴 감소", () => {
  const out = consumeSkillGrace({ skill_grace: { key: "checkin", remaining: 2 } });
  assert.deepEqual(out.skill_grace, { key: "checkin", remaining: 1 });
});

test("consumeSkillGrace — 마지막 턴 소진 시 null 전이", () => {
  const out = consumeSkillGrace({ skill_grace: { key: "checkin", remaining: 1 } });
  assert.equal(out.skill_grace, null);
});

test("consumeSkillGrace — 없으면 그대로", () => {
  assert.equal(consumeSkillGrace({}).skill_grace ?? null, null);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --import tsx --test lib/relationship/grace.test.ts`
Expected: FAIL — `grantSkillGrace is not a function` / `graceTurns` undefined

- [ ] **Step 3: `types.ts` — `skill_grace` 추가**

`lib/relationship/types.ts`의 `RelationshipMemo`(51행) 안, `active_skill`(58행) **바로 앞**에 추가:

```ts
  /** 카드뽑기 스킬 직후의 캡 면제 잔여 턴(구매한 대화 분량). 소진되면 null. 만료 없음. */
  skill_grace?: { key: string; remaining: number } | null;
```

- [ ] **Step 4: `skills.ts` — `graceTurns` 필드 + 값**

`lib/relationship/skills.ts`의 `RelationshipSkill` 인터페이스에서 `spread?: SpreadType;`(14행) 아래에 추가:

```ts
  /** 스킬 직후 하루 캡에서 면제되는 후속 대화 턴 수(kind="tarot_draw" — 분량까지 산 것). */
  graceTurns?: number;
```

그리고 `checkin` 항목의 `spread: "checkin_6",`(28행) 다음 줄에 `graceTurns: 10,`, `deep_feelings` 항목의 `spread: "deep_feelings_5",`(39행) 다음 줄에 `graceTurns: 8,` 을 추가한다.

- [ ] **Step 5: `memory.ts` — 순수 함수 2개 추가**

`lib/relationship/memory.ts` 맨 끝(`appendSkillLog` 정의 뒤)에 추가:

```ts

/** 카드뽑기 스킬 완료 시 캡 면제 턴 적립. 잔여가 있으면 누적 가산, key 는 최신 스킬로. 순수 함수. */
export function grantSkillGrace(
  memo: RelationshipMemo,
  skillKey: string,
  turns: number
): RelationshipMemo {
  if (turns <= 0) return memo;
  const prev = memo.skill_grace?.remaining ?? 0;
  return { ...memo, skill_grace: { key: skillKey, remaining: prev + turns } };
}

/** 면제 턴 1회 소진(한 왕복 = 1턴). 0 이 되면 null 로 전이. 순수 함수. */
export function consumeSkillGrace(memo: RelationshipMemo): RelationshipMemo {
  const g = memo.skill_grace;
  if (!g || g.remaining <= 0) return memo;
  const remaining = g.remaining - 1;
  return { ...memo, skill_grace: remaining > 0 ? { key: g.key, remaining } : null };
}
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `node --import tsx --test lib/relationship/grace.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → 에러 없음

```bash
git add lib/relationship/types.ts lib/relationship/skills.ts lib/relationship/memory.ts lib/relationship/grace.test.ts
git commit -m "feat(relationship): 캡 면제 턴(그레이스) — 레지스트리 graceTurns + memo 적립/소진 순수 함수"
```

---

## Task 3: 프롬프트 — 드로우 가이드 파일 + `drawContext` 주입

풀이는 **관계 페르소나** 로 생성한다(타로 페르소나 아님 — 스레드 맥락·기억이 빠지면 별콩이가 딴사람이 됨). 카드 목록은 기존 `formatDrawnCardsBlock`을 export 해서 재사용한다.

**Files:**
- Create: `data/persona/byeolkong_relationship_draw.md`
- Modify: `lib/claude.ts` — `formatDrawnCardsBlock`(486행 근처) export, `RelationshipTurnContext`(639행 근처), `buildRelationshipSystemMessage`(651행 근처)

- [ ] **Step 1: 가이드 파일 작성**

`data/persona/byeolkong_relationship_draw.md`:

```markdown
# 인-스레드 카드 풀이 가이드

유저가 방금 이 대화 안에서 카드를 뽑았어. 아래 [뽑은 카드] 를 **이 관계의 맥락에 엮어서** 읽어줘.

## 이 순서로 써

1. **자리별 해석** — 카드마다, 해석 문단 **직전에 `[CARD:n]` 을 한 줄 단독으로** 놓아(n = [뽑은 카드] 목록의 번호). 그 자리 이름과 카드가 어떻게 맞물리는지 읽어줘. 카드 뜻만 나열하지 말고 "이 자리에 이 카드가 온 의미"로.
2. **잇는 흐름** — 카드들을 한 줄기로 묶어. 어느 카드가 서로를 받쳐주고 어디서 어긋나는지.
3. **지금 필요한 처방** — 이 관계에서 당장 해볼 수 있는 구체적인 것 1~2개. "소통을 잘 해봐" 같은 추상 조언 금지.
4. **마무리 한마디** — 따뜻하게. 이어서 얘기할 여지를 남겨.

## 이 스레드니까 지킬 것

- 관계 파일(호칭·상태·그동안의 기록)을 **아는 사람으로** 읽어. 처음 만난 타로 상담가처럼 굴지 마.
- 지난 대화에서 나온 구체적인 사건·감정이 카드와 맞물리면 반드시 짚어줘. 그게 이 스레드에서 카드를 뽑는 이유야.
- **`[END]` · `[SKILL_DONE]` 마커 절대 쓰지 마.** 이 대화는 끝나지 않아 — 풀이 뒤에도 계속 이어진다.
- 질문으로 끝내지 마. 유저가 이어 말할 여지는 남기되, 답을 요구하는 질문은 던지지 마.
- 분량: 자리 수만큼의 문단 + 흐름 + 처방까지 촘촘하게. 평소 한 턴보다 확실히 길게 — 유저가 값을 치른 풀이야.
- 단정 금지 유지("~한 흐름이 보여", "~할 가능성이 있어"). 불안 자극 금지.
```

- [ ] **Step 2: `formatDrawnCardsBlock` export**

`lib/claude.ts`의 `function formatDrawnCardsBlock(cards: DrawnCard[]): string {` 선언에 `export` 를 붙인다(타로 경로 동작 불변):

```ts
export function formatDrawnCardsBlock(cards: DrawnCard[]): string {
```

- [ ] **Step 3: 드로우 가이드 로더 추가**

`lib/claude.ts`의 `getVerdictInthreadGuide()` 정의 **바로 뒤**에 추가:

```ts

let _cachedRelDrawGuide: string | null = null;
function getRelationshipDrawGuide(): string {
  if (_cachedRelDrawGuide === null) {
    _cachedRelDrawGuide =
      "\n\n" +
      readFileSync(
        join(process.cwd(), "data", "persona", "byeolkong_relationship_draw.md"),
        "utf-8"
      );
  }
  return _cachedRelDrawGuide;
}
```

- [ ] **Step 4: `RelationshipTurnContext` 확장**

`lib/claude.ts`의 `RelationshipTurnContext` 안, `activeSkill?:` 필드 **바로 뒤**에 추가:

```ts
  /** 인-스레드 카드뽑기 턴 — 드로우 가이드 + [뽑은 카드] 블록 주입. 없으면 일반 대화. */
  drawContext?: { spreadLabel: string; cardsBlock: string } | null;
```

- [ ] **Step 5: `buildRelationshipSystemMessage` 에 주입**

`verdictGuide` 상수 선언 **바로 뒤**에 `drawGuide` 를 추가하고, `dynamicPart` 템플릿의 `${verdictGuide}` 뒤에 `${drawGuide}` 를 끼운다:

```ts
  // 인-스레드 카드뽑기 — 드로우 가이드 + 뽑은 카드 목록 주입.
  const drawGuide = ctx.drawContext
    ? getRelationshipDrawGuide() +
      `\n\n## 이번 턴 — 방금 뽑은 카드\n스프레드: ${ctx.drawContext.spreadLabel}\n\n${ctx.drawContext.cardsBlock}`
    : "";
```

```ts
  const dynamicPart = `---
## 이번 세션 정보
${ctx.fileBlock}
---${firstGuide}${checkinGuide}${closeGuide}${verdictGuide}${drawGuide}${buildTurnSignalBlock(ctx.turnSignals)}`;
```

- [ ] **Step 6: 타입 체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (`drawContext`·`getRelationshipDrawGuide` 아직 호출부 없음 — Task 4에서 연결)

```bash
git add lib/claude.ts data/persona/byeolkong_relationship_draw.md
git commit -m "feat(relationship): 인-스레드 드로우 프롬프트 — 가이드 파일 + drawContext 주입 + 카드 블록 export"
```

---

## Task 4: 채팅 라우트 — `skillStart` tarot_draw 분기 (핵심)

verdict의 `if (body.skillStart !== "verdict")` 가드(215행) **앞**, compat 분기가 끝나는 지점(213행) 뒤에 tarot_draw 분기를 삽입한다. verdict/compat 코드는 건드리지 않는다.

**Files:**
- Modify: `app/api/relationship/chat/route.ts`

- [ ] **Step 1: import 확장**

`app/api/relationship/chat/route.ts` import 블록에서:

(a) `@/lib/claude` 구조분해에 `formatDrawnCardsBlock` 을 추가한다(기존 `generateOnce` 등과 같은 목록).

(b) `@/lib/relationship/memory` 구조분해에 `grantSkillGrace`, `consumeSkillGrace` 를 추가한다(`appendSkillLog` 옆).

(c) 새 import 라인들을 `import { randomUUID } from "node:crypto";` 앞에 추가:

```ts
import { SPREAD_INFO, getPositionLabels } from "@/lib/tarot/spreads";
import { extractClosingLine } from "@/lib/saju/closing";
import {
  serializeThreadDraw,
  validateDrawnCards,
  redactDrawForModel,
} from "@/lib/relationship/draw-thread";
```

- [ ] **Step 2: body 타입 + 상수 추가**

`interface Body`(58행)의 `skillStart?: string;`(61행) 뒤에 추가:

```ts
  /** kind="tarot_draw" 스킬 개시 시 클라가 뽑은 카드(서버가 위조 검증 + label 재계산). */
  drawnCards?: unknown;
```

`const VERDICT_KICKOFF = ...`(56행) 뒤에 추가:

```ts
// 카드뽑기 개시 트리거 — 비영속(DB 미저장), alternation 맞추기용 마지막 user 메시지.
const DRAW_KICKOFF = "방금 카드를 뽑았어. 펼쳐서 봐줘.";
// 카드 풀이는 값을 치른 결과물 — 일반 턴(1400)의 2배.
const DRAW_MAX_TOKENS = 2800;
```

- [ ] **Step 3: tarot_draw 분기 삽입**

`if (body.skillStart !== "verdict") {`(215행) **바로 앞**에 삽입:

```ts
    // ── Phase 3: 카드뽑기(tarot_draw) — 뽑은 카드로 인-스레드 풀이 1턴 스트리밍 ──
    const drawSkill = getSkill(body.skillStart);
    if (drawSkill?.kind === "tarot_draw" && drawSkill.spread) {
      const spread = drawSkill.spread;

      // 인-플라이트 락 — 중복 차감 방지. 같은 스킬 락이 3분 초과면 stale override(하드 크래시 복구).
      const STALE_MS = 3 * 60 * 1000;
      if (activeSkill) {
        const started = activeSkill.started_at ? new Date(activeSkill.started_at).getTime() : 0;
        const stale = activeSkill.key === drawSkill.key && Date.now() - started > STALE_MS;
        if (!stale) return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
      }
      // 패스 필수 — 기존 /api/consultations/tarot 검증의 이관.
      if (!pass) return NextResponse.json({ error: "pass_required" }, { status: 402 });

      // 카드 위조 검증 — label 은 클라 값을 버리고 서버가 재계산(최종 권위).
      const labels = getPositionLabels(spread, "love", null);
      const cards = validateDrawnCards(body.drawnCards, SPREAD_INFO[spread].cardCount, labels);
      if (!cards) return NextResponse.json({ error: "invalid_cards" }, { status: 400 });

      // 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
      const spend = await spendStars(userId, drawSkill.starCost, {
        readingId: threadReadingId,
        source: `rel_skill_${drawSkill.key}`,
      });
      if (!spend.success) {
        return NextResponse.json(
          { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: drawSkill.starCost },
          { status: 402 }
        );
      }

      // 인-플라이트 락 세팅
      const lockAt = new Date().toISOString();
      {
        const lockMemo = (rel.memo ?? {}) as RelationshipMemo;
        lockMemo.active_skill = { key: drawSkill.key, started_at: lockAt, assistant_turns: 0 };
        await supabase.from("relationships").update({ memo: lockMemo }).eq("id", rel.id);
      }

      // 카드 스트립 메시지 — 스트림 전에 저장(뽑은 결과가 먼저 스레드에 눌러앉음).
      // id 를 확보해 실패 시 이 row 만 정확히 삭제한다.
      const { data: stripRow } = await supabase
        .from("messages")
        .insert({
          reading_id: threadReadingId,
          role: "assistant",
          content: serializeThreadDraw({ skill: drawSkill.key, spread, cards }),
          skill_key: drawSkill.key,
          created_at: lockAt,
        })
        .select("id")
        .single();

      const drawLogCtx = { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "draw", skill: drawSkill.key } };
      const rollbackDraw = async (err: unknown) => {
        const refund = await chargeStars(
          userId,
          drawSkill.starCost,
          `refund_${randomUUID()}`,
          `rel_skill_${drawSkill.key}_refund`
        ).catch(() => null);
        if (!refund) {
          await logError(new Error("draw_refund_failed"), ctxFromRequest(request, drawLogCtx));
        }
        if (stripRow?.id) {
          await supabase.from("messages").delete().eq("id", stripRow.id);
        }
        const undo = (rel.memo ?? {}) as RelationshipMemo;
        undo.active_skill = null;
        await supabase.from("relationships").update({ memo: undo }).eq("id", rel.id);
        await logError(err, ctxFromRequest(request, drawLogCtx));
      };

      // 모델 입력 = 최근창(스레드 맥락 · compat/스트립 치환) + 비영속 드로우 트리거
      const { data: pastRows } = await supabase
        .from("messages")
        .select("role, content")
        .eq("reading_id", threadReadingId)
        .order("created_at", { ascending: true });
      const past = redactDrawForModel(redactCompatForModel((pastRows ?? []) as ThreadMsg[]));
      const split = splitThreadMessages(past, rel.summarized_msg_count ?? 0);
      const apiMessages = [...split.apiMessages, { role: "user" as const, content: DRAW_KICKOFF }];

      const fileBlock = buildRelationshipFileBlock(
        {
          label: rel.label,
          status: rel.status as RelationshipStatus,
          hasSelfBirth: !!rel.self_profile_id,
          hasPartnerBirth: !!rel.partner_profile_id,
          memo: memoObj,
        },
        rel.rolling_summary
      );
      const systemMessage = buildRelationshipSystemMessage({
        fileBlock,
        isFirstEver: false,
        checkinPrompt: null,
        dailyClose: false,
        drawContext: {
          spreadLabel: `${drawSkill.label} · ${cards.length}장`,
          cardsBlock: formatDrawnCardsBlock(cards),
        },
      });

      let drawText = "";
      const drawStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamChat(systemMessage, apiMessages, DRAW_MAX_TOKENS, drawLogCtx)) {
              drawText += chunk;
              controller.enqueue(encoder.encode(chunk));
            }
            if (!drawText.trim()) throw new Error("empty_assistant_stream");

            // 풀이 저장 + skill_log 적립 + 그레이스 적립 + 락 해제 (한 update)
            const now = new Date().toISOString();
            await supabase.from("messages").insert([
              { reading_id: threadReadingId, role: "assistant", content: drawText, skill_key: drawSkill.key, created_at: now },
            ]);
            const summary = extractClosingLine([{ role: "assistant", content: drawText }]) ?? "";
            const doneMemo = (rel.memo ?? {}) as RelationshipMemo;
            const withGrace = grantSkillGrace(
              appendSkillLog(doneMemo, drawSkill.key, threadReadingId, summary, now),
              drawSkill.key,
              drawSkill.graceTurns ?? 0
            );
            withGrace.active_skill = null;
            await supabase.from("relationships").update({ memo: withGrace, last_visited_at: now }).eq("id", rel.id);

            controller.close();
          } catch (err) {
            await rollbackDraw(err);
            controller.error(err);
          }
        },
      });
      return new Response(drawStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/api/relationship/chat/route.ts
git commit -m "feat(relationship): chat 라우트 skillStart tarot_draw 분기(카드 검증·차감·스트립·SSE·그레이스·환불)"
```

---

## Task 5: 채팅 라우트 — 일반 경로 그레이스 소진 + 스트립 치환

그레이스 잔여가 있으면 소프트캡을 우회하고 그 왕복 메시지에 `skill_key` 를 태깅해 `getTodayThreadTurns`(user + `skill_key IS NULL` 카운트)에서 빠지게 한다. 최근창에도 스트립 치환을 적용한다.

**Files:**
- Modify: `app/api/relationship/chat/route.ts` (일반 메시지 경로: 311·318·326·401·407행 근처)

- [ ] **Step 1: 그레이스 상태 계산 추가**

`const inVerdict = activeSkill?.key === "verdict";`(311행) **바로 뒤**에 추가:

```ts
  // 카드뽑기 그레이스 — 잔여가 있으면 이 왕복은 하루 캡에서 면제(구매한 대화 분량).
  const graceKey = (memoObj.skill_grace?.remaining ?? 0) > 0 ? memoObj.skill_grace!.key : null;
```

- [ ] **Step 2: 소프트캡 판정에 그레이스 반영**

`const dailyClose = !inVerdict && todayTurns >= dailyTurnAllowance(todayExtend);`(318행)을 교체:

```ts
  const dailyClose = !inVerdict && !graceKey && todayTurns >= dailyTurnAllowance(todayExtend);
```

- [ ] **Step 3: 최근창에 스트립 치환 적용**

일반 경로의 `const past = redactCompatForModel((pastRows ?? []) as ThreadMsg[]);`(326행)을 교체:

```ts
  const past = redactDrawForModel(redactCompatForModel((pastRows ?? []) as ThreadMsg[]));
```

- [ ] **Step 4: 메시지 태깅 + 그레이스 소진**

`const skillTag = inVerdict ? "verdict" : null;`(401행)을 교체:

```ts
        const skillTag = inVerdict ? "verdict" : graceKey;
```

그리고 같은 `try` 블록에서 memo 를 갱신하는 지점(`const memo = (rel.memo ?? {}) as RelationshipMemo;` — 407행 근처)의 판정 분기 뒤, `relationships` update 직전에 그레이스 소진을 반영한다. 판정 세그먼트가 아닐 때만 소진하도록 다음 블록을 삽입:

```ts
        // 그레이스 소진 — 판정 세그먼트가 아니고 잔여가 있던 왕복만 1턴 차감.
        if (!inVerdict && graceKey) {
          const consumed = consumeSkillGrace(memo);
          memo.skill_grace = consumed.skill_grace ?? null;
        }
```

> 주의: 이 블록은 `memo` 를 `relationships` 에 update 하는 호출 **앞**에 있어야 한다(같은 update 로 함께 저장). verdict 분기가 `memo.active_skill` 을 만지는 코드와 순서 충돌 없음 — `!inVerdict` 가드로 분리됨.

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add app/api/relationship/chat/route.ts
git commit -m "feat(relationship): 일반 대화 경로 그레이스 소진(캡 면제 + skill_key 태깅) + 스트립 최근창 치환"
```

---

## Task 6: `ThreadCardStrip` — 스레드 카드 스트립

새로 그리지 않는다. `components/tarot/CardSpreadView.tsx` 가 이미 5장(3+2)·6장(2×3) 그리드 + 포지션 라벨 + 역방향 회전 + 카드명을 렌더한다. **단 그 색상이 다크 배경 전용**(`text-white/70`·`text-gold`)이므로 다크 패널로 감싸 재사용한다 — 앱의 사주판/타로판 다크 관례와도 일치.

**Files:**
- Create: `components/relationship/ThreadCardStrip.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/relationship/ThreadCardStrip.tsx`:

```tsx
"use client";

// 인-스레드 카드 스트립 — 별콩이가 이 대화 안에서 뽑아 펼친 카드판.
// content=드로우 JSON 인 assistant 메시지에서 ThreadChat 이 렌더한다(별도 페이지 없음).
// CardSpreadView 를 그대로 재사용하되, 그 컴포넌트가 다크 배경 전용 색상이라 다크 패널로 감싼다.
import CardSpreadView from "@/components/tarot/CardSpreadView";
import { getSkill } from "@/lib/relationship/skills";
import type { ThreadDraw } from "@/lib/relationship/draw-thread";

export default function ThreadCardStrip({ draw }: { draw: ThreadDraw }) {
  const skill = getSkill(draw.skill);

  return (
    <div className="flex justify-start mb-3 pl-10">
      <div
        className="w-full max-w-[300px] rounded-2xl px-3.5 pt-3 pb-4 shadow-sm"
        style={{ background: "linear-gradient(150deg, #2A1F4D, #1F1735)" }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <span aria-hidden>{skill?.emoji ?? "🃏"}</span>
          <span className="text-[12px] font-bold text-gold">
            {skill?.label ?? "카드"}
          </span>
          <span className="text-[11px] text-white/50">· {draw.cards.length}장</span>
        </div>
        <CardSpreadView drawnCards={draw.cards} spreadType={draw.spread} activeIndex={null} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 미마운트 — Task 8에서 연결)

- [ ] **Step 3: 커밋**

```bash
git add components/relationship/ThreadCardStrip.tsx
git commit -m "feat(relationship): 인-스레드 카드 스트립 ThreadCardStrip(CardSpreadView 다크 패널 재사용)"
```

---

## Task 7: `ThreadDrawModal` — 가장자리 여백 모달

`components/upsell/ClarifierSheet.tsx` 의 쉘 패턴(portal + dim + shallow history + ESC + 스크롤 잠금)을 따르되, 바텀시트가 아니라 **가장자리 여백 모달**(`inset-0` + `p-3` + 내부 `rounded-3xl` 패널 + `max-h-full overflow-y-auto`)로 만들고 `CardDrawRitual` 을 slim 없이 넣는다.

**Files:**
- Create: `components/relationship/ThreadDrawModal.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/relationship/ThreadDrawModal.tsx`:

```tsx
"use client";

// 인-스레드 카드뽑기 모달 — 스레드를 떠나지 않고 뽑는 의식을 진행한다.
// 가장자리 여백 + dim 으로 뒤 스레드가 비쳐 "화면 이동이 아님"을 계속 신호한다.
// 셸 패턴(portal·shallow history·ESC·스크롤 잠금)은 components/upsell/ClarifierSheet.tsx 와 동일.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { SPREAD_INFO, getPositionLabels, type DrawnCard } from "@/lib/tarot/spreads";
import type { RelationshipSkill } from "@/lib/relationship/skills";

interface Props {
  skill: RelationshipSkill;
  /** 확인 완료 → 카드 제출. 성공하면 부모가 모달을 닫는다(실패 시 열린 채로 카드 보존). */
  onSubmit: (cards: DrawnCard[]) => Promise<boolean>;
  onClose: () => void;
}

export default function ThreadDrawModal({ skill, onSubmit, onClose }: Props) {
  const [pending, setPending] = useState<DrawnCard[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // shallow history — OS/브라우저 뒤로가기로 닫기
  useEffect(() => {
    history.pushState({ sheet: "reldraw" }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeModal() {
    if (submitting) return;
    if (history.state?.sheet === "reldraw") history.back();
    else onClose();
  }

  const spread = skill.spread!;
  const info = SPREAD_INFO[spread];
  const labels = getPositionLabels(spread, "love", null);

  const openConfirm = (drawn: DrawnCard[]) => {
    setPending(drawn);
    setError(null);
    setBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = await r.json();
        setBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setBalance(0);
      }
    })();
  };

  const confirm = () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setError(null);
    void (async () => {
      const ok = await onSubmit(pending);
      if (!ok) {
        // 실패 — 뽑은 카드를 보존하고 모달을 유지한다(다시 뽑게 하지 않음).
        setSubmitting(false);
        setPending(null);
        setError("시작이 안 됐어. 다시 시도해줄래?");
      }
    })();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-night/70 backdrop-blur-sm p-3 animate-fade-in"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label={`${skill.label} 카드 뽑기`}
    >
      <div
        className="w-full max-w-md bg-cream rounded-3xl border border-lilac-mid/30 shadow-[0_8px_32px_rgba(31,23,53,0.28)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-[16px] font-bold text-eye-purple">
            {skill.emoji} {skill.label}
          </h2>
          <button
            onClick={closeModal}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="text-[12px] text-red-500 text-center px-5 mb-2">{error}</p>
        )}

        {submitting ? (
          <div className="py-16 text-center text-text-light text-sm">
            별콩이가 카드를 펼치는 중…
          </div>
        ) : (
          <CardDrawRitual
            cardCount={info.cardCount}
            slotLabels={labels}
            accent={info.accent}
            ritualLabel={skill.label}
            completeLabel="이 카드로 볼게"
            onComplete={openConfirm}
          />
        )}
      </div>

      {pending && !submitting && (
        <StarConfirmModal
          spreadLabel={skill.label}
          cost={skill.starCost}
          balance={balance}
          loading={balance === null}
          accent={info.accent}
          onConfirm={confirm}
          onCharge={() => { window.location.href = "/shop"; }}
          onClose={() => setPending(null)}
        />
      )}
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. `CardDrawRitual` 의 `onBack` 은 optional 이 아니면 타입 에러가 난다 — 그 경우 `onBack={closeModal}` 과 `backLabel="닫기"` 를 props 에 추가한다.

- [ ] **Step 3: 커밋**

```bash
git add components/relationship/ThreadDrawModal.tsx
git commit -m "feat(relationship): 인-스레드 카드뽑기 모달 ThreadDrawModal(여백 모달 + CardDrawRitual)"
```

---

## Task 8: `ThreadChat` 배선 + `useSkillLaunch` tarot_draw 인-스레드화

모달 오픈/제출, 스트립·칩 렌더, 로딩 버블을 연결한다. `useSkillLaunch` 의 tarot_draw 분기를 `onInThreadSkill` 로 바꿔 화면 이탈을 끊는다.

**Files:**
- Modify: `lib/relationship/useSkillLaunch.ts:92-110`
- Modify: `components/relationship/ThreadChat.tsx`

- [ ] **Step 1: `useSkillLaunch` — tarot_draw 를 인-스레드로**

`lib/relationship/useSkillLaunch.ts` `launch()` 안의 tarot_draw 분기(99–102행)를 교체:

```ts
    if (skill.kind === "tarot_draw") {
      // 인-스레드 개시 — ThreadChat 이 뽑기 모달을 연다(라우팅·sessionStorage 없음).
      onInThreadSkill?.(skill.key);
      return;
    }
```

- [ ] **Step 2: `ThreadChat` — import 추가**

`components/relationship/ThreadChat.tsx` 의 `import ThreadCompatCard from "./ThreadCompatCard";`(16행) 뒤에 추가:

```tsx
import ThreadCardStrip from "./ThreadCardStrip";
import ThreadDrawModal from "./ThreadDrawModal";
import { tryParseThreadDraw, splitByCardMarker } from "@/lib/relationship/draw-thread";
import type { DrawnCard } from "@/lib/tarot/spreads";
```

- [ ] **Step 3: 상태 추가**

`const [compatLoading, setCompatLoading] = useState(false);`(134행) 뒤에 추가:

```tsx
  const [drawSkillKey, setDrawSkillKey] = useState<string | null>(null);
  const [drawLoading, setDrawLoading] = useState(false);
```

- [ ] **Step 4: `sendSkillStart` 에 tarot_draw 분기**

`sendSkillStart`(278행) 첫 부분의 compat 위임 분기 **바로 뒤**에 추가:

```tsx
    if (getSkill(skillKey)?.kind === "tarot_draw") {
      setDrawSkillKey(skillKey); // 모달 오픈 — 차감은 카드 확정 후 submitDraw 가 담당
      return;
    }
```

- [ ] **Step 5: `submitDraw` 추가**

`sendCompatSkill` 정의가 끝나는 `};` 뒤에 추가:

```tsx

  // 인-스레드 카드뽑기 제출 — 카드 확정 후 SSE 풀이를 스레드에 스트리밍한다.
  // 반환값 false = 실패(모달이 열린 채로 카드를 보존하고 재시도).
  const submitDraw = async (cards: DrawnCard[]): Promise<boolean> => {
    const skillKey = drawSkillKey;
    if (!skillKey || sending) return false;
    setError(null);
    setActiveSkill(skillKey); // 낙관적 락
    setDrawLoading(true);
    try {
      const res = await fetch("/api/relationship/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, skillStart: skillKey, drawnCards: cards }),
      });
      if (res.status === 402) {
        setDrawLoading(false);
        setActiveSkill(null);
        router.push("/shop");
        return true; // 이동하므로 모달 유지 불필요
      }
      if (!res.ok || !res.body) {
        setDrawLoading(false);
        setActiveSkill(null);
        return false;
      }
      window.dispatchEvent(new Event("byeolkong:balance-updated"));

      // 모달 닫고 스트립을 낙관적으로 삽입(서버 저장본과 label 이 동일 함수 결과라 일치)
      const spread = getSkill(skillKey)?.spread;
      setDrawSkillKey(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: JSON.stringify({ v: 1, skill: skillKey, spread, cards }),
          createdAt: new Date().toISOString(),
        },
      ]);

      // 풀이 스트리밍
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setDrawLoading(false);
      setSending(true);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLiveText(acc);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: acc, createdAt: new Date().toISOString() },
      ]);
      setLiveText("");
      setSending(false);
      setActiveSkill(null); // 원샷 — 즉시 종료
      onSkillDone?.();
      return true;
    } catch {
      setDrawLoading(false);
      setSending(false);
      setActiveSkill(null);
      return false;
    }
  };
```

> 주의: `setLiveText`/`setSending`/`router` 는 이미 이 컴포넌트에 존재하는 상태/훅이다(`sendMessage` 와 동일 사용). 스트리밍 루프는 `sendSkillStart` 의 기존 패턴과 같다 — 그 함수의 reader 루프를 참고해 동일한 상태 이름을 쓴다.

- [ ] **Step 6: 스트립 렌더 분기 추가**

`messages.map` 안의 compat 분기(458–466행) **바로 뒤**에 삽입:

```tsx
            // 드로우 스트립 JSON 메시지 → 카드판 렌더
            const draw = tryParseThreadDraw(msg.content);
            if (draw) {
              return (
                <Fragment key={i}>
                  {dateDivider}
                  <ThreadCardStrip draw={draw} />
                </Fragment>
              );
            }
```

- [ ] **Step 7: `[CARD:n]` 칩 렌더**

같은 `messages.map` 의 일반 assistant 버블 분기에서, `msg.content` 에 `[CARD:` 가 있으면 `splitByCardMarker` 로 나눠 세그먼트마다 칩 + 버블을 렌더한다. 칩 라벨은 **이 메시지 직전의 가장 가까운 스트립 메시지**에서 가져온다. 일반 버블 분기 앞에 삽입:

```tsx
            if (msg.content.includes("[CARD:")) {
              // 직전 스트립(backward scan) — 칩 라벨(자리 · 카드명)의 출처
              let strip: ReturnType<typeof tryParseThreadDraw> = null;
              for (let j = i - 1; j >= 0; j--) {
                const d = tryParseThreadDraw(messages[j].content);
                if (d) { strip = d; break; }
              }
              const segs = splitByCardMarker(msg.content);
              return (
                <Fragment key={i}>
                  {dateDivider}
                  {segs.map((seg, k) => {
                    const card = seg.cardIndex != null ? strip?.cards[seg.cardIndex - 1] : null;
                    return (
                      <div key={k}>
                        {card && (
                          <div className="pl-10 mb-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-lilac-soft px-2.5 py-0.5 text-[11px] font-bold text-lilac-deep">
                              {card.label} · {getCard(card.card_id)?.name_kr ?? ""}
                              {card.direction === "reversed" ? " (역)" : ""}
                            </span>
                          </div>
                        )}
                        <ChatBubble
                          role="assistant"
                          content={stripMarkers(seg.text)}
                          showAvatar={k === 0}
                          showName={k === 0}
                        />
                      </div>
                    );
                  })}
                </Fragment>
              );
            }
```

`getCard` import 를 상단에 추가한다:

```tsx
import { getCard } from "@/lib/tarot/cards";
```

> `stripMarkers` 는 이 파일 37행의 기존 헬퍼(마커 제거)다 — 실제 함수명이 다르면 그 이름을 쓴다.

- [ ] **Step 8: 로딩 버블 + 모달 마운트**

compat 로딩 버블 블록 뒤에 드로우 로딩 버블을 추가:

```tsx
          {drawLoading && (
            <ChatBubble
              role="assistant"
              content="별콩이가 카드를 펼치는 중 ✨"
              showAvatar
              showName
              streaming
            />
          )}
```

그리고 컴포넌트 return 의 최상위 끝부분(compat 관련 오버레이/시트가 마운트되는 위치 근처)에 모달을 추가:

```tsx
      {drawSkillKey && getSkill(drawSkillKey) && (
        <ThreadDrawModal
          skill={getSkill(drawSkillKey)!}
          onSubmit={submitDraw}
          onClose={() => setDrawSkillKey(null)}
        />
      )}
```

- [ ] **Step 9: 입력 비활성 조건에 `drawLoading` 추가**

`compatLoading` 으로 입력을 막는 지점(textarea/전송 버튼의 `disabled`)에 `|| drawLoading` 을 추가한다 — 생성 중 자유 메시지가 락과 레이스하지 않게.

- [ ] **Step 10: 타입 체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음

```bash
git add lib/relationship/useSkillLaunch.ts components/relationship/ThreadChat.tsx
git commit -m "feat(relationship): ThreadChat 드로우 모달·스트립·CARD 칩 배선 + tarot_draw 인-스레드 개시"
```

---

## Task 9: 애널리틱스 — source 특수 케이스 2줄

인-스레드 스킬의 차감은 `reading_id` 가 스레드 본체(`skill_key` 영구 null)를 가리키므로, source 로 종목을 살리지 않으면 "스레드 대화"로 조용히 뭉개진다(Phase 2 회귀 `70273c5` 와 동일 함정).

**Files:**
- Modify: `lib/analytics/aggregate.ts:384` 근처

- [ ] **Step 1: 케이스 추가**

`lib/analytics/aggregate.ts` 의 `if (src === "rel_skill_compat") { ... }`(384행) **바로 뒤**에 추가:

```ts
    if (src === "rel_skill_checkin") { add("relationship", "스킬:checkin", tx); continue; }
    if (src === "rel_skill_deep_feelings") { add("relationship", "스킬:deep_feelings", tx); continue; }
```

- [ ] **Step 2: 타입 체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음

```bash
git add lib/analytics/aggregate.ts
git commit -m "fix(analytics): 인-스레드 카드뽑기 별소모를 스킬:checkin/deep_feelings 로 분류"
```

---

## Task 10: recap 체인 + 이동형 잔재 일괄 제거

이동형이 0이 되어 복귀 인사 계열 전체가 dead 가 된다. **과거 스킬 reading 열람은 유지**(`readings.relationship_id`/`skill_key` 컬럼, `/tarot/result` 복귀 CTA, `app/api/readings/[id]` 매핑은 손대지 않는다).

**Files:**
- Modify: `components/relationship/ThreadChat.tsx` (10·87·103·146-185행)
- Modify: `lib/relationship/skills.ts:79-88`
- Modify: `app/relationship/page.tsx` (60·90·290행)
- Modify: `app/api/relationship/route.ts:51`
- Delete: `app/api/relationship/recap-seen/route.ts`
- Modify: `lib/relationship/memory.ts:82-98`
- Delete: `lib/relationship/skill-log.ts`
- Modify: `lib/relationship/types.ts` (55·62-67행)
- Modify: `lib/relationship/useSkillLaunch.ts` (10행 import, 59-66행)
- Modify: `app/tarot/draw/page.tsx`
- Modify: `app/api/consultations/tarot/route.ts` (20-21·166-191·234-235행)
- Modify: `app/api/consultations/tarot/chat/route.ts` (10·288-306행)

- [ ] **Step 1: `ThreadChat` — recap 계열 제거**

다음을 삭제한다:
- 10행 import 에서 `buildSkillRecapText` (→ `import { getSkill } from "@/lib/relationship/skills";`)
- 87행 `skillRecap?: { skill: string; summary: string } | null;` prop 선언(위 주석 포함)
- 103행 구조분해의 `skillRecap = null,`
- 146–166행 복귀 인사 이펙트 블록(`recapShownRef` 선언 포함)
- 168–185행 타자기 틱 이펙트 블록

삭제로 고아가 된 state/ref(`recapShownRef`, 타자기용 state)도 함께 제거한다. `npx tsc --noEmit` 로 고아를 확인한다.

- [ ] **Step 2: `buildSkillRecapText` 삭제**

`lib/relationship/skills.ts` 의 `buildSkillRecapText` 정의 전체(79–88행, 상단 주석 포함)를 삭제한다.

- [ ] **Step 3: `page.tsx` — recap 제거**

`app/relationship/page.tsx` 에서 60행 `const [recap, setRecap] = useState…`, 90행 `setRecap(...)`, 290행 `skillRecap={recap}` 을 삭제한다.

- [ ] **Step 4: GET 응답에서 `recap` 제거**

`app/api/relationship/route.ts` 51행 `recap: memoData?.pending_skill_recap ?? null,` 를 삭제한다(`activeSkill` 은 유지).

- [ ] **Step 5: recap-seen 라우트 삭제**

```bash
git rm app/api/relationship/recap-seen/route.ts
```

- [ ] **Step 6: `applySkillToMemo` 삭제**

`lib/relationship/memory.ts` 의 `applySkillToMemo` 정의 전체(82–98행, 주석 포함)를 삭제한다.

- [ ] **Step 7: `skill-log.ts` 삭제**

```bash
git rm lib/relationship/skill-log.ts
```

- [ ] **Step 8: `types.ts` — 고아 타입/상수 제거**

`lib/relationship/types.ts` 에서 삭제:
- 55행 `pending_skill_recap?: …` 필드
- 62–67행 `RelSkillMarker` 인터페이스 + `REL_SKILL_KEY` 상수(주석 포함)

- [ ] **Step 9: `useSkillLaunch` — `launchTarotDraw` 제거**

`lib/relationship/useSkillLaunch.ts` 에서 10행 `import { REL_SKILL_KEY } from "./types";` 와 59–66행 `launchTarotDraw` 정의를 삭제한다(Task 8에서 호출부가 이미 사라짐).

- [ ] **Step 10: `/tarot/draw` — 관계 분기 제거**

`app/tarot/draw/page.tsx` 에서 삭제:
- 19–20행 관계 관련 import(`getSkill`/`RelationshipSkill`, `REL_SKILL_KEY`/`RelSkillMarker`)
- 25–26행 `REL_SKILL_EMOTION` 상수(주석 포함)
- 28–36행 `resolveRelSkill` 함수
- 41행 `relSkill` state, 48–50행 `submitting`/`submitError` state(주석 포함)
- 53–79행 `useEffect` 의 관계 marker 분기(→ `useEffect` 는 `TAROT_SPREAD_KEY` 로드만 남는다)
- 145–195행 `goToReading` 의 관계 POST 분기(→ 일반 플로우 3줄만 남는다)
- 218행 `onBack` 의 조건부(→ `onBack={() => router.push("/tarot")}`)
- 238–247행 `submitError` 토스트 블록

고아 import(`createPortal` 등)를 `npx tsc --noEmit` 로 확인해 정리한다.

- [ ] **Step 11: `/api/consultations/tarot` — 관계 태깅 제거**

`app/api/consultations/tarot/route.ts` 에서 삭제:
- 20–21행 `getSkill`·`getActivePass` import (관계 분기 전용이라 고아 확정 — 확인됨)
- 37–48행 body 타입의 `relationshipId?`/`skillKey?` 필드
- 166–191행 `relationshipTag` 검증 블록 전체
- 234–235행 reading insert 의 `relationship_id`/`skill_key` 두 줄

- [ ] **Step 12: 타로 chat 라우트 — `logSkillToThread` 제거**

`app/api/consultations/tarot/chat/route.ts` 에서 10행 import 와 288–306행 `logSkillToThread` 블록을 삭제한다. **107행 select 의 `relationship_id, skill_key` 컬럼은 남긴다**(과거 reading 식별에 계속 유효).

- [ ] **Step 13: 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `grep -rn "pending_skill_recap\|REL_SKILL_KEY\|logSkillToThread\|applySkillToMemo\|buildSkillRecapText\|recap-seen" app/ components/ lib/`
Expected: 출력 없음

- [ ] **Step 14: 커밋**

```bash
git add -A
git commit -m "refactor(relationship): 이동형 스킬 잔재 일괄 제거(recap 체인·REL_SKILL_KEY·타로 라우트 관계 태깅)"
```

---

## Task 11: 페르소나 — §스킬 제안 인-스레드 통일

이제 모든 스킬이 인-스레드다. "이동형 예고" 규칙과 스킬별 예외 구조 자체를 없애고 "지금 여기서 바로" 톤으로 통일한다.

**Files:**
- Modify: `data/persona/byeolkong_relationship.md` (§스킬 제안, 74–76행 근처)

- [ ] **Step 1: 이동형 예고 불릿 교체**

`data/persona/byeolkong_relationship.md` 의 "연속성 예고 (이동형 스킬: `checkin`·`deep_feelings`)" 불릿(74행)을 다음으로 교체한다:

```markdown
- **모든 스킬은 인-스레드 — "지금 여기서"**: 어떤 스킬도 다른 화면으로 보내지 않아. 별콩이가 **이 대화 안에서** 바로 봐주고 결과도 여기 남아. 그러니 "갔다 와서 이어서" 같은 예고는 절대 하지 마. 예) "그럼 지금 여기서 카드 여섯 장 뽑아볼까 — 뽑으면 바로 펼쳐서 읽어줄게." 카드뽑기 스킬(`checkin`·`deep_feelings`)은 유저가 이 대화 안에서 카드를 고르는 순서만 한 번 거친다.
```

- [ ] **Step 2: 스킬별 예외 불릿 정리**

`verdict` 인-스레드 예외 불릿(75행)과 `compat` 인-스레드 예외 불릿(76행)에서 "예외" 표현을 제거한다(예외가 아니라 전부 인-스레드가 됐으므로) — 각 스킬의 **고유 진행 방식** 설명만 남긴다:
- `verdict`: 양쪽 입장을 몇 턴 주고받은 뒤 판정한다는 점
- `compat`: 둘 사주로 바로 결과 카드를 건넨다는 점

`{호칭}` 플레이스홀더를 **예시 인용문에 넣지 않는다**(모델이 토큰째 출력하는 사고 — Phase 1 사례).

- [ ] **Step 3: 커밋**

```bash
git add data/persona/byeolkong_relationship.md
git commit -m "feat(relationship): 페르소나 — 모든 스킬 인-스레드 톤 통일(이동형 예고 제거)"
```

---

## Task 12: 통합 검증

**Files:** (검증만 — 코드 변경 없음)

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 관계 유닛 테스트 전체**

Run: `node --import tsx --test lib/relationship/draw-thread.test.ts lib/relationship/grace.test.ts lib/relationship/compat-thread.test.ts lib/relationship/memory.test.ts`
Expected: PASS (draw-thread 7 + grace 7 + 기존 전부)

- [ ] **Step 3: 프로덕션 빌드**

Run: `npx next build`
Expected: 빌드 성공

- [ ] **Step 4: 런타임 스모크 (머니 패스)**

`scripts/smoke-compat-inthread.ts` 를 본떠 `scripts/smoke-draw-inthread.ts` 를 만든다. 실제 Claude 호출로 다음을 검증:
1. `skillStart:"checkin"` + 유효 6장 → 200 스트림, 풀이 텍스트에 `[CARD:` 마커 존재
2. `messages` 에 스트립(파싱 성공) + 풀이 2건이 `skill_key='checkin'` 로 저장
3. `relationships.memo` 에 `skill_log` 적립 + `skill_grace.remaining === 10` + `active_skill === null`
4. `star_transactions` 에 `source='rel_skill_checkin'` −45 1건
5. 위조 카드(5장) → 400 `invalid_cards`, 차감 없음

Expected: 5개 항목 ALL PASS

- [ ] **Step 5: 브라우저 E2E (dev) — 골든 패스**

> ⚠️ 페르소나 파일을 수정했으므로 dev 서버 **재시작** 필수(모듈 캐시) — [[qa-harness-usage]]

활성 패스가 있는 관계로:
1. 스킬 시트/칩 → "관계 체크인" → **모달 오픈, 뒤 스레드가 어둡게 비치는지 확인**
2. 덱 스와이프 → 6슬롯 FLIP → 정/역 선택 → "이 카드로 볼게" → `StarConfirmModal`(45⭐) 확인
3. 로딩 버블 → 스레드에 **카드 스트립**(다크 패널, 6장 그리드 + 자리 라벨) → 풀이 스트리밍, 단락마다 **"자리 · 카드명" 칩**
4. 이어서 일반 메시지 1건 전송 → 별콩이가 카드 얘기를 자연스럽게 이어감(JSON 을 되뇌지 않음)
5. 새로고침 → 스트립 + 풀이 + 칩이 그대로 영속
6. `/api/stars/balance` 45 차감 확인

Expected: 각 단계 정상, `read_console_messages`/`preview_logs` 에러 없음

- [ ] **Step 6: 브라우저 E2E (dev) — 엣지**

1. 모달에서 뒤로가기/ESC/배경 클릭 → 닫힘(차감 없음)
2. 잔액 < 45 → 확인 시 `/shop` 이동
3. 패스 없는 상태에서 스킬 칩 → 패스 안내(402 처리)
4. 생성 중 채팅 입력이 비활성인지 확인

Expected: 이중 차감 없음, 스레드 오염 없음

- [ ] **Step 7: 일반 타로 회귀 확인**

`/tarot` → 스프레드 선택 → `/tarot/draw` → 카드 뽑기 → 확인 → `/tarot/reading` → `[END]` → `/tarot/result`
Expected: 관계 분기 제거 후에도 일반 타로 흐름 무손상

- [ ] **Step 8: 최종 상태 확인**

Run: `git status` / `git log --oneline -12`
Expected: 작업 트리 clean, Task 1–11 커밋 11개

---

## Self-Review 결과 (작성자 체크)

- **스펙 커버리지**: 데이터(스트립 저장·grace·마이그레이션 없음)=T1,T2,T4 · 개시/모달=T7,T8 · 라우트 분기(검증·차감·락·스트림·환불)=T4 · 그레이스 소진=T5 · 프롬프트/페르소나=T3,T11 · 렌더(스트립·칩)=T6,T8 · 애널리틱스=T9 · 제거 목록 13항목=T10 · 테스트/E2E=T1,T2,T12. 스펙 전 섹션 매핑됨.
- **플레이스홀더**: 없음. T7 Step 2 / T8 Step 7 의 조건부 지시는 **실제 코드 확인 후 분기**하라는 검증 스텝이며 미정 요구사항이 아니다.
- **타입 일관성**: `serializeThreadDraw`/`tryParseThreadDraw`/`ThreadDraw`(T1) ↔ T4 저장 · T6 렌더 · T8 파싱 왕복 일치(`v:1`). `validateDrawnCards(input, cardCount, labels)`(T1) ↔ T4 호출 일치. `grantSkillGrace`/`consumeSkillGrace`(T2, 순수 반환) ↔ T4/T5 사용 일치. `RelationshipSkill.graceTurns`(T2) ↔ T4 `drawSkill.graceTurns ?? 0`. `drawContext:{spreadLabel,cardsBlock}`(T3) ↔ T4 전달 일치. `splitByCardMarker` → `{cardIndex,text}`(T1) ↔ T8 사용 일치. `ThreadCardStrip({draw})`(T6) ↔ T8 마운트 일치. `ThreadDrawModal({skill,onSubmit,onClose})`(T7) ↔ T8 마운트 + `submitDraw: (cards)=>Promise<boolean>` 일치.
- **money-path 안전**: 차감(T4) 이후 모든 실패 경로가 `rollbackDraw`(환불 + 스트립 삭제 + 락 해제 + 로깅)를 지나고, 환불 실패는 삼켜지지 않고 `logError` 된다. 위조 검증·패스·락은 모두 차감 **앞**에 있다.
