# 고민 이어가기 (Reading Continuation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완료된 reading에서 "이 고민 이어가기"로 과거 요약을 기억하는 새 reading을 시작한다 (사주+타로, 유저 선택형 2경로).

**Architecture:** 새 `readings` row가 `previous_reading_id`로 부모를 참조. 서버 복사 경로(saju-fresh/saju-deep/tarot-deep)는 신규 `/api/readings/continue`가 부모 필드를 복사해 생성. 클라 재추첨 경로(tarot-fresh)는 기존 타로 draw 흐름에 연속성 마커를 실어 보냄. chat 라우트가 부모 요약(지난 고민+마지막 한마디)을 system prompt에 주입.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase(Postgres), node:test(+tsx) for pure-logic units, tsc/next build + dev 수동 검증.

**Spec:** [docs/superpowers/specs/2026-06-29-reading-continuation-design.md](../specs/2026-06-29-reading-continuation-design.md)

---

## 파일 구조

- Create: `lib/continuation.ts` — 순수 헬퍼: 정가 조회 + deep 할인가 계산.
- Create: `lib/continuation.test.ts` — 가격 헬퍼 단위 테스트 (node:test).
- Create: `supabase/migrations/20260629000000_reading_continuation.sql` — 스키마.
- Create: `app/api/readings/continue/route.ts` — 서버 복사 생성 (saju-fresh/saju-deep/tarot-deep).
- Create: `app/continue/[readingId]/page.tsx` — 경로 선택 화면.
- Modify: `lib/claude.ts` — `continuation` 컨텍스트 + 주입 블록 + 첫 턴 가이드 교체 (사주·타로).
- Modify: `data/persona/byeolkong.md` — 마무리 약속 정정.
- Modify: `app/api/consultations/saju/chat/route.ts` — 부모 요약 조회 → buildSystemMessage.
- Modify: `app/api/consultations/tarot/chat/route.ts` — 부모 요약 조회 → buildTarotSystemMessage.
- Modify: `app/api/consultations/tarot/route.ts` — tarot-fresh 연속성 링크 수용.
- Modify: `app/tarot/reading/page.tsx` — 연속성 마커를 reading 생성 POST에 포함.
- Modify: `app/(consultations)/saju/result/page.tsx` — "이 고민 이어가기" CTA.
- Modify: `app/tarot/result/page.tsx` — "이 고민 이어가기" CTA.
- Modify: `app/readings/page.tsx` — ended consult 카드에 이어가기 액션.

---

## Task 1: 가격 헬퍼 `lib/continuation.ts` (+ 단위 테스트)

**Files:**
- Create: `lib/continuation.ts`
- Test: `lib/continuation.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/continuation.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { continuationPrice, fullCostFor, CONTINUATION_DISCOUNT_RATE } from "./continuation.ts";

test("deep = 정가의 60% 반올림", () => {
  assert.equal(continuationPrice(20, "deep"), 12); // 사주
  assert.equal(continuationPrice(10, "deep"), 6);  // one_card
  assert.equal(continuationPrice(15, "deep"), 9);  // two_card
  assert.equal(continuationPrice(25, "deep"), 15); // three_card
  assert.equal(continuationPrice(40, "deep"), 24); // relationship_5
});

test("fresh = 정가 그대로", () => {
  assert.equal(continuationPrice(20, "fresh"), 20);
  assert.equal(continuationPrice(40, "fresh"), 40);
});

test("CONTINUATION_DISCOUNT_RATE 는 0.6", () => {
  assert.equal(CONTINUATION_DISCOUNT_RATE, 0.6);
});

test("fullCostFor — 타로는 스프레드 정가, 그 외 사주 정가", () => {
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "one_card" }), 10);
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "relationship_5" }), 40);
  assert.equal(fullCostFor({ consultationType: "saju", spreadType: null }), 20);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --import tsx --test lib/continuation.test.ts`
Expected: FAIL (Cannot find module './continuation.ts' 또는 export 없음)

- [ ] **Step 3: 최소 구현**

`lib/continuation.ts`:
```ts
// 이어가기 가격 헬퍼 — deep 은 상품 정가의 60%(="40% 할인") 반올림, fresh 는 정가.
// 가격 기준은 부모 stars_spent 가 아니라 상품 정가 — 체인(이어가기를 또 이어가기) 시
// 할인이 누적돼 0으로 수렴하는 것 방지.

import { SAJU_READING_COST } from "@/lib/saju/constants";
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export const CONTINUATION_DISCOUNT_RATE = 0.6;

export type ContinuationMode = "fresh" | "deep";

export function continuationPrice(fullCost: number, mode: ContinuationMode): number {
  if (mode === "fresh") return fullCost;
  return Math.round(fullCost * CONTINUATION_DISCOUNT_RATE);
}

export function fullCostFor(opts: {
  consultationType: "saju" | "tarot";
  spreadType?: SpreadType | null;
}): number {
  if (opts.consultationType === "tarot" && opts.spreadType) {
    return SPREAD_INFO[opts.spreadType].starCost;
  }
  return SAJU_READING_COST;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/continuation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/continuation.ts lib/continuation.test.ts
git commit -m "feat(continuation): 이어가기 가격 헬퍼 (deep 60% 반올림)"
```

---

## Task 2: 마이그레이션 — `previous_reading_id` + `continuation_mode`

**Files:**
- Create: `supabase/migrations/20260629000000_reading_continuation.sql`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260629000000_reading_continuation.sql`:
```sql
-- 고민 이어가기: 완료된 reading 을 참조하는 새 reading.
-- previous_reading_id 부모 삭제 시 SET NULL (이어가기 reading 자체는 보존, 요약 주입만 사라짐).

ALTER TABLE readings
  ADD COLUMN previous_reading_id uuid REFERENCES readings(id) ON DELETE SET NULL,
  ADD COLUMN continuation_mode text CHECK (continuation_mode IN ('fresh', 'deep'));

CREATE INDEX idx_readings_previous
  ON readings(previous_reading_id)
  WHERE previous_reading_id IS NOT NULL;
```

- [ ] **Step 2: 커밋 (Supabase Git sync 가 dev 브랜치에 자동 적용)**

```bash
git add supabase/migrations/20260629000000_reading_continuation.sql
git commit -m "feat(db): readings.previous_reading_id + continuation_mode"
```

> 검증: push 후 Supabase dev 브랜치 Workflow logs 에서 Migrations SUCCESS 확인 (AGENTS.md Phase 4(a) 노트 참고). 로컬에선 SQL 실행 불가.

---

## Task 3: `lib/claude.ts` — 연속성 컨텍스트 주입 + 첫 턴 가이드 교체

**Files:**
- Modify: `lib/claude.ts`

연속성이면 (a) `dynamicPart` 에 "이어가기 세션" 블록 주입, (b) 첫 턴엔 product/tarot 첫 턴 가이드 대신 *연속성 첫 턴 가이드* 사용.

- [ ] **Step 1: 공유 타입 + 블록 빌더 추가 (`lib/claude.ts` 상단, import 직후)**

`SajuReadingContext`/`TarotReadingContext` 가 공유할 타입과 블록 빌더를 파일 상단(예: `getPersona` 정의 아래)에 추가:
```ts
export interface ContinuationContext {
  prevQuestion: string;
  prevClosing: string | null;
  mode: "fresh" | "deep";
}

/** 이어가기 세션 동적 블록 — dynamicPart 말미에 붙음. */
function buildContinuationBlock(c: ContinuationContext, subject: "사주판" | "카드"): string {
  const toneLine =
    c.mode === "deep"
      ? `같은 ${subject}을 더 깊이 파는 톤으로.`
      : `새로 펼친 결을 지난 맥락과 연결해서.`;
  return `\n\n## 이어가기 세션 (지난 고민 연속)\n[지난 고민: ${c.prevQuestion}]\n[지난번 별콩이 마지막 한마디: ${c.prevClosing ?? "(기록 없음)"}]\n- 첫 응답을 "지난번에 ~ 얘기 나눴었지" 식으로 자연스럽게 이어서 열 것.\n- ${toneLine}`;
}

/** 이어가기 첫 턴 가이드 — product/tarot 첫 턴 가이드를 대체. */
function continuationFirstTurnGuide(subject: "사주" | "카드"): string {
  return `\n\n## 첫 턴 가이드 — 이어가기 세션\n\n이번 턴은 지난 고민을 이어받는 첫 응답이야. (1) "지난번에 ~ 얘기 나눴었지" 식으로 지난 맥락을 가볍게 짚으며 연결 → (2) 그 위에서 이번 고민을 ${subject}로 풀이 (처음 만난 듯 새로 소개하지 말 것) → (3) 흐름·가능성·선택 키워드 중심 → (4) 응원. 단정 X. 400~700자.`;
}
```

- [ ] **Step 2: `SajuReadingContext` 에 `continuation` 필드 추가**

`lib/claude.ts` 의 `SajuReadingContext` 인터페이스 끝에 추가:
```ts
  /** 이어가기 세션이면 부모 요약 — 없으면 일반 reading */
  continuation?: ContinuationContext | null;
```

- [ ] **Step 3: `buildSystemMessage` 에서 첫 턴 가이드 분기 + 블록 주입**

`buildSystemMessage` 내 `firstTurnGuide` 정의를 교체:
```ts
  const firstTurnGuide = isFirstTurn
    ? ctx.continuation
      ? continuationFirstTurnGuide("사주")
      : SAJU_PRODUCT_FIRST_TURN_GUIDE[ctx.sajuProduct]
    : "";
```

같은 함수의 `dynamicPart` 템플릿 마지막 줄 `${emotionBlock}${firstTurnGuide}${wrapGuide}` 를 교체:
```ts
${emotionBlock}${firstTurnGuide}${wrapGuide}${ctx.continuation ? buildContinuationBlock(ctx.continuation, "사주판") : ""}`;
```

- [ ] **Step 4: `TarotReadingContext` + `buildTarotSystemMessage` 동일 적용**

`TarotReadingContext` 인터페이스 끝에 추가:
```ts
  /** 이어가기 세션이면 부모 요약 — 없으면 일반 reading */
  continuation?: ContinuationContext | null;
```

`buildTarotSystemMessage` 내 `firstTurnGuide` 정의를 교체:
```ts
  const firstTurnGuide = isFirstTurn
    ? ctx.continuation
      ? continuationFirstTurnGuide("카드")
      : `\n\n## 첫 턴 가이드\n\n이번 턴은 **타로 풀이의 첫 응답**이야. 위 "타로 풀이 출력 구조" 의 스프레드별 흐름을 따라줘 — 여러 장이면 각 카드 해석 직전에 [CARD:n] 마커를 한 줄 단독으로 넣고, 마지막에 사용자 고민과 카드를 엮어서 답을 줘. 단정 X, 흐름·가능성·선택 키워드 중심.`
    : "";
```

`buildTarotSystemMessage` 의 `dynamicPart` 마지막 줄 `${emotionBlock}${firstTurnGuide}${wrapGuide}` 를 교체:
```ts
${emotionBlock}${firstTurnGuide}${wrapGuide}${ctx.continuation ? buildContinuationBlock(ctx.continuation, "카드") : ""}`;
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (기존 호출부는 continuation optional 이라 영향 없음)

- [ ] **Step 6: 커밋**

```bash
git add lib/claude.ts
git commit -m "feat(continuation): claude system message 에 이어가기 요약 주입 + 첫 턴 가이드 교체"
```

---

## Task 4: 페르소나 마무리 화법 정정

**Files:**
- Modify: `lib/claude.ts` (사주·타로 `gracefulClosingBlock` 문자열)
- Modify: `data/persona/byeolkong.md`

이어가기가 실기능이 됐으니 "새로 펼쳐서"라는 빈 약속 회피 문구를 "이어가기로 다시 만나자"로 정정.

- [ ] **Step 1: 사주 `gracefulClosingBlock` 정정 (`lib/claude.ts`)**

`buildSystemMessage` 내 사주 `gracefulClosingBlock` 의 이 줄:
```
- 돌아옴을 '이어짐'으로 프레이밍: "이건 다음에 새로 사주를 펼쳐서 같이 더 봐도 좋아. 별콩이는 여기서 기다릴게." (지금은 [END] 뒤 같은 대화를 재개하는 기능이 없으니 '새로 펼쳐서'로 표현 — 빈 약속 금지)
```
를 다음으로 교체:
```
- 돌아옴을 '이어짐'으로 프레이밍: "이 고민, 다음에 '이어가기'로 다시 만나자. 별콩이는 여기서 기다릴게." (결과 화면의 '이 고민 이어가기' 로 지난 맥락을 기억한 채 다시 이어갈 수 있어.)
```

- [ ] **Step 2: 타로 `gracefulClosingBlock` 정정 (`lib/claude.ts`)**

`buildTarotSystemMessage` 내 타로 `gracefulClosingBlock` 의 이 줄:
```
- 돌아옴을 '이어짐'으로 프레이밍: "이건 다음에 새로 카드를 펼쳐서 같이 더 봐도 좋아. 별콩이는 여기서 기다릴게." (지금은 [END] 뒤 같은 대화를 재개하는 기능이 없으니 '새로 펼쳐서'로 표현 — 빈 약속 금지)
```
를 다음으로 교체:
```
- 돌아옴을 '이어짐'으로 프레이밍: "이 고민, 다음에 '이어가기'로 다시 만나자. 별콩이는 여기서 기다릴게." (결과 화면의 '이 고민 이어가기' 로 지난 맥락을 기억한 채 다시 이어갈 수 있어.)
```

- [ ] **Step 3: 페르소나 md 의 동일 취지 문구 확인·정정**

`data/persona/byeolkong.md` 에서 "새로 펼쳐" / "재개하는 기능이 없" 류 마무리 문구를 검색:
```bash
grep -nE "새로 펼쳐|재개하는 기능|기다릴게|이어서 보자" data/persona/byeolkong.md
```
해당 문장이 있으면 "다음에 '이어가기'로 다시 만나자" 톤으로 정정 (없으면 이 스텝은 변경 없이 넘어감 — md 에 없을 수 있음).

- [ ] **Step 4: 빌드**

Run: `npx next build`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add lib/claude.ts data/persona/byeolkong.md
git commit -m "feat(persona): 마무리 약속을 '이어가기로 다시 만나자' 로 정정"
```

---

## Task 5: `/api/readings/continue` — 서버 복사 생성 (saju-fresh/saju-deep/tarot-deep)

**Files:**
- Create: `app/api/readings/continue/route.ts`

부모를 복사해 새 reading 을 만든다. tarot-fresh 는 클라 재추첨이 필요하므로 여기서 처리하지 않는다(Task 7·8).

- [ ] **Step 1: 라우트 작성**

`app/api/readings/continue/route.ts`:
```ts
// 이어가기 — 서버 복사 생성. saju-fresh/saju-deep/tarot-deep 처리.
// (tarot-fresh 는 새 카드 추첨이 필요해 /api/consultations/tarot 로 감)
//
// 흐름: 세션 → 부모 소유권 + ended 검증 → 부모 필드 복사 → 가격 계산
//       → readings INSERT(previous_reading_id+continuation_mode) → spendStars → 실패 시 롤백.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { continuationPrice, fullCostFor, type ContinuationMode } from "@/lib/continuation";
import type { SpreadType } from "@/lib/tarot/spreads";

export const dynamic = "force-dynamic";

interface ContinueBody {
  previousReadingId: string;
  mode: ContinuationMode;
  concern: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: ContinueBody;
  try {
    body = (await request.json()) as ContinueBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.previousReadingId !== "string" || !body.previousReadingId) {
    return NextResponse.json({ error: "previous_reading_id_required" }, { status: 400 });
  }
  if (body.mode !== "fresh" && body.mode !== "deep") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }
  if (typeof body.concern !== "string" || body.concern.length < 1 || body.concern.length > 500) {
    return NextResponse.json({ error: "invalid_concern" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // 부모 조회 + 소유권
  const { data: parent, error: pErr } = await supabase
    .from("readings")
    .select(
      "id, user_id, profile_id, saju_data, consultation_type, spread_type, spread_category, saju_product, emotion_tag, drawn_cards, has_sensitive"
    )
    .eq("id", body.previousReadingId)
    .maybeSingle();

  if (pErr || !parent) {
    return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
  }
  if (parent.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (parent.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  // tarot-fresh 는 새 카드가 필요하므로 이 라우트가 아님
  const consultationType = (parent.consultation_type as "saju" | "tarot") ?? "saju";
  if (consultationType === "tarot" && body.mode === "fresh") {
    return NextResponse.json({ error: "tarot_fresh_uses_draw_flow" }, { status: 400 });
  }

  // 부모가 마무리됐는지(ended) 검증 — assistant 메시지에 [END] 존재
  const { data: msgRows } = await supabase
    .from("messages")
    .select("content")
    .eq("reading_id", parent.id)
    .eq("role", "assistant");
  const ended = (msgRows ?? []).some((m) => m.content.includes("[END]"));
  if (!ended) {
    return NextResponse.json({ error: "parent_not_ended" }, { status: 400 });
  }

  // 가격: 상품 정가 기준
  const fullCost = fullCostFor({
    consultationType,
    spreadType: parent.spread_type as SpreadType | null,
  });
  const cost = continuationPrice(fullCost, body.mode);

  // 잔액 사전 확인
  const balance = await getStarBalance(userId);
  if (balance < cost) {
    return NextResponse.json(
      { error: "Insufficient stars", code: "INSUFFICIENT_STARS", balance, required: cost },
      { status: 402 }
    );
  }

  // 부모 필드 복사 + 새 고민 + 연속성 링크
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: parent.profile_id,
      question: body.concern,
      saju_data: parent.saju_data,
      consultation_type: consultationType,
      spread_type: parent.spread_type,
      spread_category: parent.spread_category,
      saju_product: parent.saju_product,
      emotion_tag: parent.emotion_tag,
      drawn_cards: parent.drawn_cards,
      stars_spent: cost,
      has_sensitive: false,
      previous_reading_id: parent.id,
      continuation_mode: body.mode,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await logError(rErr ?? new Error("continue reading insert null"), {
      route: "/api/readings/continue",
      userId,
      extra: { stage: "reading_insert", previousReadingId: parent.id },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  const spend = await spendStars(userId, cost, {
    readingId: reading.id,
    source: consultationType === "tarot" ? "tarot_reading" : "saju_reading",
  });
  if (!spend.success) {
    await supabase.from("readings").delete().eq("id", reading.id);
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: cost,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    id: reading.id,
    consultationType,
    success: true,
    cost,
    balance: spend.balance,
  });
}
```

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공 (`/api/readings/continue` 라우트 컴파일됨)

- [ ] **Step 3: 커밋**

```bash
git add app/api/readings/continue/route.ts
git commit -m "feat(continuation): /api/readings/continue 서버 복사 생성 라우트"
```

---

## Task 6: 사주 chat 라우트 — 부모 요약 주입

**Files:**
- Modify: `app/api/consultations/saju/chat/route.ts`

- [ ] **Step 1: 부모 요약 조회 + buildSystemMessage 에 전달**

`app/api/consultations/saju/chat/route.ts` 상단 import 에 추가:
```ts
import { extractClosingLine } from "@/lib/saju/closing";
```

reading 조회 select 에 `previous_reading_id` 추가 (기존 `.select("id, user_id, question, saju_data, emotion_tag, saju_product")` 를 교체):
```ts
    .select("id, user_id, question, saju_data, emotion_tag, saju_product, previous_reading_id, continuation_mode")
```

`buildSystemMessage(...)` 호출 직전에 부모 요약 조회 블록 삽입 (누적 turn 계산 이후):
```ts
  // 이어가기면 부모 요약(지난 고민 + 마지막 한마디) 조회
  let continuation:
    | { prevQuestion: string; prevClosing: string | null; mode: "fresh" | "deep" }
    | null = null;
  if (reading.previous_reading_id) {
    const { data: parent } = await supabase
      .from("readings")
      .select("question")
      .eq("id", reading.previous_reading_id)
      .maybeSingle();
    if (parent) {
      const { data: parentMsgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("reading_id", reading.previous_reading_id)
        .order("created_at", { ascending: true });
      continuation = {
        prevQuestion: parent.question ?? "",
        prevClosing: extractClosingLine(
          (parentMsgs ?? []) as { role: "user" | "assistant"; content: string }[]
        ),
        mode: (reading.continuation_mode as "fresh" | "deep") ?? "deep",
      };
    }
  }
```

`buildSystemMessage({...})` 호출 객체에 `continuation` 추가:
```ts
  const systemMessage = buildSystemMessage({
    saju: reading.saju_data as SajuResult,
    sajuProduct: isSajuProduct(reading.saju_product)
      ? reading.saju_product
      : "today_letters",
    concernText: reading.question ?? "",
    emotionTag: reading.emotion_tag as string | null,
    assistantTurnsSoFar,
    cumulativeAssistantChars,
    continuation,
  });
```

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add app/api/consultations/saju/chat/route.ts
git commit -m "feat(continuation): 사주 chat 부모 요약 주입"
```

---

## Task 7: 타로 chat 라우트 — 부모 요약 주입

**Files:**
- Modify: `app/api/consultations/tarot/chat/route.ts`

- [ ] **Step 1: 현재 reading select + buildTarotSystemMessage 호출부 확인**

Run: `grep -nE "\.select\(|buildTarotSystemMessage|previous_reading|order\(" app/api/consultations/tarot/chat/route.ts`
Expected: reading 조회 select 와 buildTarotSystemMessage 호출 위치 파악.

- [ ] **Step 2: 부모 요약 조회 + 전달**

`app/api/consultations/tarot/chat/route.ts` 상단 import 에 추가:
```ts
import { extractClosingLine } from "@/lib/saju/closing";
```

reading 조회 select 에 `previous_reading_id, continuation_mode` 를 추가 (기존 select 문자열 끝에 두 컬럼 추가).

`buildTarotSystemMessage(...)` 호출 직전에 부모 요약 조회 블록 삽입 (Task 6 Step 1 과 동일 패턴):
```ts
  let continuation:
    | { prevQuestion: string; prevClosing: string | null; mode: "fresh" | "deep" }
    | null = null;
  if (reading.previous_reading_id) {
    const { data: parent } = await supabase
      .from("readings")
      .select("question")
      .eq("id", reading.previous_reading_id)
      .maybeSingle();
    if (parent) {
      const { data: parentMsgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("reading_id", reading.previous_reading_id)
        .order("created_at", { ascending: true });
      continuation = {
        prevQuestion: parent.question ?? "",
        prevClosing: extractClosingLine(
          (parentMsgs ?? []) as { role: "user" | "assistant"; content: string }[]
        ),
        mode: (reading.continuation_mode as "fresh" | "deep") ?? "deep",
      };
    }
  }
```

`buildTarotSystemMessage({ ... })` 호출 객체에 `continuation,` 추가.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add app/api/consultations/tarot/chat/route.ts
git commit -m "feat(continuation): 타로 chat 부모 요약 주입"
```

---

## Task 8: 타로 생성 라우트 — tarot-fresh 연속성 링크 수용

**Files:**
- Modify: `app/api/consultations/tarot/route.ts`

tarot-fresh 는 새 카드를 뽑아 기존 타로 생성 라우트로 온다. `previousReadingId`+`continuationMode='fresh'` 를 받아 저장 (가격은 정가 유지).

- [ ] **Step 1: body 타입 + 저장 추가**

`TarotPostBody` 인터페이스에 추가:
```ts
  previousReadingId?: string;
  continuationMode?: "fresh" | "deep";
```

`readings` INSERT 객체(`.insert({ ... })`) 에 두 필드 추가 — 검증된 값만:
```ts
      previous_reading_id:
        typeof body.previousReadingId === "string" && body.previousReadingId
          ? body.previousReadingId
          : null,
      continuation_mode: body.continuationMode === "fresh" ? "fresh" : null,
```

> 주: tarot-fresh 는 정가(`cost = info.starCost`) 그대로. deep 은 이 라우트로 오지 않음(Task 5). 부모 소유권은 클라가 /continue 에서 이미 통과했고, FK 가 무결성을 보장 — 추가 검증 생략(YAGNI).

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add app/api/consultations/tarot/route.ts
git commit -m "feat(continuation): 타로 생성 라우트 tarot-fresh 연속성 링크 수용"
```

---

## Task 9: 타로 reading 페이지 — 연속성 마커를 생성 POST 에 포함

**Files:**
- Modify: `app/tarot/reading/page.tsx`

tarot-fresh 흐름: `/continue` 가 `sessionStorage["byeolkong:continuation"]` 에 `{previousReadingId, mode:"fresh"}` 를 심고 `/tarot` 로 보냄 → draw 후 이 페이지가 reading 을 생성할 때 마커를 POST 에 포함하고 즉시 삭제.

- [ ] **Step 1: 생성 POST 직전에 연속성 마커 읽기 + body 포함**

`app/tarot/reading/page.tsx` 의 `/api/consultations/tarot` POST 호출부(현재 `body: JSON.stringify({ spreadType, spreadCategory, emotion, concern, drawnCards })`)를 교체:
```ts
        const contRaw =
          typeof window !== "undefined"
            ? sessionStorage.getItem("byeolkong:continuation")
            : null;
        let cont: { previousReadingId?: string; mode?: string } = {};
        try {
          cont = contRaw ? JSON.parse(contRaw) : {};
        } catch {
          cont = {};
        }
        const r = await fetch("/api/consultations/tarot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadType: parsed.spreadType,
            spreadCategory: parsed.spreadCategory,
            emotion: parsed.emotion,
            concern: parsed.concern,
            drawnCards: parsed.drawnCards,
            previousReadingId: cont.previousReadingId,
            continuationMode: cont.mode === "fresh" ? "fresh" : undefined,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("byeolkong:continuation");
        }
```

> 주: 기존 코드의 `const r = await fetch(...)` 한 줄을 위 블록으로 대체. 후속 `if (!r.ok)` 등은 그대로 유지.

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add app/tarot/reading/page.tsx
git commit -m "feat(continuation): 타로 reading 생성 시 연속성 마커 포함"
```

---

## Task 10: `/continue/[readingId]` 경로 선택 페이지

**Files:**
- Create: `app/continue/[readingId]/page.tsx`

부모 요약 표시 + 고민 프리필/편집 + 두 경로 버튼(가격 표기) + 분기.

- [ ] **Step 1: 페이지 작성**

`app/continue/[readingId]/page.tsx`:
```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { extractClosingLine } from "@/lib/saju/closing";
import { continuationPrice, fullCostFor } from "@/lib/continuation";
import type { SpreadType } from "@/lib/tarot/spreads";

const MIN_LEN = 10;
const MAX_LEN = 200;

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}
interface ParentReading {
  id: string;
  question: string;
  consultationType?: string;
  spreadType?: SpreadType | null;
  spreadCategory?: string | null;
  emotionTag?: string | null;
  hasSensitive: boolean;
}

export default function ContinuePage({
  params,
}: {
  params: Promise<{ readingId: string }>;
}) {
  const { readingId } = use(params);
  const router = useRouter();
  const [parent, setParent] = useState<ParentReading | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!me?.isAuthenticated) {
        router.replace(`/login?next=/continue/${readingId}`);
        return;
      }
      const d = await fetch(`/api/readings/${readingId}`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!d?.reading) {
        setError("이어갈 고민을 불러오지 못했어");
        return;
      }
      const r = d.reading as ParentReading;
      if (r.hasSensitive) {
        router.replace("/readings");
        return;
      }
      setParent(r);
      setConcern((r.question ?? "").slice(0, MAX_LEN));
      setClosing(extractClosingLine((d.messages ?? []) as MessageRow[]));
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((b) => b && setBalance(b.balance ?? 0))
        .catch(() => {});
    })();
  }, [router, readingId]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p className="text-[14px] text-text-light mb-4">{error}</p>
        <Link href="/readings" className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]">
          내 고민톡으로
        </Link>
      </main>
    );
  }
  if (!parent) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const consultationType = (parent.consultationType as "saju" | "tarot") ?? "saju";
  const fullCost = fullCostFor({ consultationType, spreadType: parent.spreadType });
  const deepCost = continuationPrice(fullCost, "deep");

  const start = async (mode: "fresh" | "deep") => {
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    const cost = mode === "fresh" ? fullCost : deepCost;
    if (balance !== null && balance < cost) {
      router.push("/shop");
      return;
    }
    setError(null);

    // tarot-fresh: 새 카드 추첨 필요 → 마커 심고 타로 흐름으로
    if (consultationType === "tarot" && mode === "fresh") {
      sessionStorage.setItem(
        "byeolkong:continuation",
        JSON.stringify({ previousReadingId: parent.id, mode: "fresh" })
      );
      // 타로 진입에 필요한 pending (감정 + 고민) — /tarot 가 읽음
      sessionStorage.setItem(
        "byeolkong:pending_consultation",
        JSON.stringify({ emotion: parent.emotionTag ?? "", concern, type: "tarot" })
      );
      router.push("/tarot");
      return;
    }

    // 서버 복사 경로
    setSubmitting(true);
    try {
      const res = await fetch("/api/readings/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousReadingId: parent.id, mode, concern }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === "INSUFFICIENT_STARS") {
          router.push("/shop");
          return;
        }
        setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      if (data.consultationType === "tarot") {
        router.push(`/tarot/reading?id=${data.id}`);
      } else {
        router.push(`/saju/reading?id=${data.id}`);
      }
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setSubmitting(false);
    }
  };

  const remain = MAX_LEN - concern.length;

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/readings" className="text-[12px] text-text-light/70">‹ 내 고민톡</Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <Image src="/byeolkong-main.png" alt="별콩이" width={88} height={88} priority />
        <h1 className="mt-3 font-display text-xl font-bold text-eye-purple text-center">
          이 고민, 이어가볼까?
        </h1>
      </div>

      {/* 지난 맥락 앵커 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex flex-col gap-2">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="text-[11px] font-bold text-text-light mb-1">지난번 고민</div>
          <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap">{parent.question}</p>
        </div>
        {closing && (
          <div className="bg-gradient-to-br from-gold-soft/30 via-lilac-soft/60 to-cream-warm rounded-2xl p-4 border border-gold-soft/40">
            <div className="text-[11px] font-bold text-eye-purple mb-1">별콩이 마지막 한마디</div>
            <p className="text-[13px] text-eye-purple leading-relaxed">{closing}</p>
          </div>
        )}
      </div>

      {/* 고민 편집 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2">
        <label className="text-[12px] text-text-light">이어서 나눌 고민 (수정 가능)</label>
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value.slice(0, MAX_LEN))}
          rows={4}
          className="w-full p-3 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] leading-relaxed resize-none placeholder:text-text-light/50"
        />
        <div className="flex justify-between text-[11px] text-text-light/70">
          <span>{concern.length < MIN_LEN ? `최소 ${MIN_LEN}자` : " "}</span>
          <span>{concern.length} / {MAX_LEN}</span>
        </div>
        {balance !== null && (
          <div className="text-[11px] text-text-light/80 text-right">내 별 잔액: {balance}별</div>
        )}
        {error && <p className="text-[12px] text-red-500 text-center">{error}</p>}

        {/* 두 경로 */}
        <button
          onClick={() => start("fresh")}
          disabled={submitting || concern.length < MIN_LEN}
          className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✨ 새로 펼쳐 이어보기 (⭐ {fullCost})
        </button>
        <button
          onClick={() => start("deep")}
          disabled={submitting || concern.length < MIN_LEN}
          className="w-full py-3.5 rounded-xl border border-lilac-deep/50 text-lilac-deep font-bold text-[15px] hover:bg-lilac-deep/5 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          🔍 같은 결로 더 깊이 (⭐ {deepCost}
          <span className="text-[11px] text-lilac-deep/70">40% 할인</span>)
        </button>
      </div>
    </main>
  );
}
```

> 의존: `/api/readings/[id]` 가 `consultationType`/`spreadType`/`spreadCategory`/`emotionTag`/`hasSensitive`/`messages` 를 반환함(현재 그대로). 추가 변경 불필요.

- [ ] **Step 2: 빌드**

Run: `npx next build`
Expected: 성공 (`/continue/[readingId]` 라우트 컴파일)

- [ ] **Step 3: 커밋**

```bash
git add app/continue/[readingId]/page.tsx
git commit -m "feat(continuation): /continue/[id] 경로 선택 화면"
```

---

## Task 11: 사주 result 페이지 — "이 고민 이어가기" CTA

**Files:**
- Modify: `app/(consultations)/saju/result/page.tsx`

- [ ] **Step 1: CTA 추가**

`app/(consultations)/saju/result/page.tsx` 의 CTA 영역에서, `<ShareButtons .../>` 와 "새 사주 보러가기" `<Link>` 사이에 이어가기 CTA 추가. `reading.hasSensitive` 면 숨김:
```tsx
        {!reading.hasSensitive && (
          <Link
            href={`/continue/${reading.id}`}
            className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center hover:bg-lilac-deep/90 transition"
          >
            이 고민 이어가기 →
          </Link>
        )}
```

> 주: `reading.hasSensitive` 는 이미 `FetchData.reading` 에 있음. result 페이지는 ended reading 만 도달하므로 ended 체크 불필요.

- [ ] **Step 2: 빌드**

Run: `npx next build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add "app/(consultations)/saju/result/page.tsx"
git commit -m "feat(continuation): 사주 result 에 이어가기 CTA"
```

---

## Task 12: 타로 result 페이지 — "이 고민 이어가기" CTA

**Files:**
- Modify: `app/tarot/result/page.tsx`

- [ ] **Step 1: result 페이지의 CTA 영역 + hasSensitive 변수명 확인**

Run: `grep -nE "hasSensitive|has_sensitive|ShareButtons|새 카드|/tarot\"|reading\.id|href=" app/tarot/result/page.tsx`
Expected: CTA 링크 위치 + sensitive 플래그 접근 경로 파악.

- [ ] **Step 2: CTA 추가**

타로 result 의 하단 CTA(공유/새 카드) 영역에, sensitive 가 아닐 때만 이어가기 링크 추가 (Step 1 에서 확인한 reading id 변수와 sensitive 플래그명을 사용):
```tsx
        {!hasSensitive && (
          <Link
            href={`/continue/${readingId}`}
            className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center hover:bg-lilac-deep/90 transition"
          >
            이 고민 이어가기 →
          </Link>
        )}
```

> Step 1 결과에 맞춰 `hasSensitive`/`readingId` 를 실제 변수명으로 치환. `Link` import 가 없으면 `import Link from "next/link";` 추가.

- [ ] **Step 3: 빌드**

Run: `npx next build`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add app/tarot/result/page.tsx
git commit -m "feat(continuation): 타로 result 에 이어가기 CTA"
```

---

## Task 13: `/readings` 히스토리 — ended consult 카드에 이어가기 액션

**Files:**
- Modify: `app/readings/page.tsx`

ended(=완료) consult 카드에서 결과로 가는 기존 링크는 유지하되, 별도 "이어가기" 진입을 추가. 미완료(resume) 카드와 시각적으로 구분.

- [ ] **Step 1: ended consult 카드에 이어가기 버튼 추가**

`app/readings/page.tsx` 의 consult 탭 렌더(Task 에서 본 `tab === "consult"` 블록). 각 카드의 `canResume`(미완료) 가 아니고 `r.hasSensitive` 가 아니면, 카드 하단에 작은 이어가기 액션을 둔다. 카드 전체가 `<Link>` 이므로, 이어가기는 **카드 밖**의 별도 줄로 추가해 중첩 링크를 피한다. 기존 `<Link key={r.id} ...>...</Link>` 를 `<div key={r.id}>` 래퍼로 감싸고 그 안에 카드 Link + (조건부) 이어가기 Link 를 둔다:
```tsx
              return (
                <div key={r.id} className="flex flex-col">
                  <Link
                    href={href}
                    className="bg-white rounded-2xl p-3.5 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] flex gap-3 items-start hover:border-lilac-deep/50 transition"
                  >
                    {/* ...기존 카드 내부 그대로... */}
                  </Link>
                  {!canResume && !r.hasSensitive && (
                    <Link
                      href={`/continue/${r.id}`}
                      className="self-end mt-1 mr-1 text-[11px] font-bold text-lilac-deep hover:underline"
                    >
                      이 고민 이어가기 →
                    </Link>
                  )}
                </div>
              );
```

> 주: 기존 `<Link key={r.id} href={href} className="...">...</Link>` 전체를 위 구조로 교체. 카드 내부 JSX(`isTarot ? ... : sajuAvatar(r)` 와 본문 `<div className="flex-1 ...">`)는 그대로 새 `<Link>` 안으로 옮긴다. `key` 는 바깥 `<div>` 로 이동.

- [ ] **Step 2: 빌드**

Run: `npx next build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add app/readings/page.tsx
git commit -m "feat(continuation): 히스토리 ended 카드에 이어가기 액션"
```

---

## Task 14: 통합 검증 + dev 푸시

**Files:** (없음 — 검증/배포)

- [ ] **Step 1: 전체 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npx next build`
Expected: 성공, 신규 라우트(`/api/readings/continue`, `/continue/[readingId]`) 포함.

- [ ] **Step 2: 단위 테스트**

Run: `node --import tsx --test lib/continuation.test.ts`
Expected: PASS.

- [ ] **Step 3: dev 푸시**

```bash
git push origin dev
```
Expected: Supabase dev Workflow logs Migrations SUCCESS + Vercel Preview 배포.

- [ ] **Step 4: dev 수동 검증 체크리스트** (사용자와 함께)

1. 사주 풀이 완료([END]) → result 에 "이 고민 이어가기" 노출, /readings ended 사주 카드에 액션 노출.
2. `/continue/[id]` 진입: 지난 고민·마지막 한마디 표시, 고민 프리필/편집, 두 버튼 가격(사주 fresh 20 / deep 12) 정확.
3. 사주 deep → 12별 차감, /saju/reading 직행, 첫 응답이 "지난번에 ~" 로 열림 + 사주 풀이 포함.
4. 사주 fresh → 20별 차감, 동일 사주판, 연속성 톤.
5. 타로 완료 → result/history 이어가기 → /continue: 타로 가격(예 three_card fresh 25 / deep 15) 정확.
6. 타로 deep → 15별, 같은 카드 복사 + 연속성. 타로 fresh → /tarot draw → 새 카드 + 25별 + 연속성 마커 저장 확인.
7. `has_sensitive=true` 부모: CTA 미노출 (result + history), `/continue/[id]` 직접 접근 시 /readings 로 리다이렉트.
8. 미완료(resume) 카드엔 이어가기 액션 안 뜸(resume 배지만).

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- §2 모델(새 row+요약 주입) → Task 1·5·6·7 ✓
- §2 2경로/가격 → Task 1(헬퍼)·5(deep)·8(fresh) ✓
- §3 진입점(result+history) → Task 11·12·13 ✓; 선택화면 `/continue` → Task 10 ✓
- §3 경로별 흐름(tarot-fresh draw / 그 외 서버복사) → Task 5·9·10 ✓
- §4 스키마 → Task 2 ✓
- §5 프롬프트 주입 + 첫 턴 교체 → Task 3·6·7 ✓
- §6 페르소나 정정 → Task 4 ✓
- §7 엣지(sensitive 차단/ended/별부족/SET NULL) → Task 5(sensitive·ended·별부족)·10(sensitive)·6·7(SET NULL 시 previous null 가드) ✓

**Placeholder scan:** Task 7·12 는 기존 코드 형태가 가변(변수명/select 문자열)이라 grep 확인 스텝을 먼저 두고 실제 코드로 치환하게 함 — "TODO" 가 아니라 확인 후 적용 절차. 그 외 코드 스텝은 완전한 코드 포함.

**Type consistency:** `ContinuationMode = "fresh"|"deep"`, `continuation: { prevQuestion, prevClosing, mode }` 가 claude.ts(Task3)·chat 라우트(Task6·7)에서 동일. `continuationPrice`/`fullCostFor` 시그니처가 Task1 정의와 Task5·10 사용처 일치. sessionStorage 키 `byeolkong:continuation` 이 Task9·10 일치.
