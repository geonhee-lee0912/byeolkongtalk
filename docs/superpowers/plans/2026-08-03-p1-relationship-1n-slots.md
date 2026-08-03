# P1 — 우리 사이 1:N + 관계 슬롯 (백엔드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우리 사이를 "유저당 상대 1명(v1)"에서 "여러 상대(1:N)"로 전환하고, 2번째 상대부터 관계 슬롯을 별로 구매해 여는 **백엔드**를 만든다. (화면은 P2)

**Architecture:** `relationships`의 유저당-1개 unique index를 제거해 다중 행을 허용한다. 슬롯은 별도 테이블 없이 `star_transactions`의 `source='relationship_slot'` 행 개수로 세고, **허용 관계 수 = 1(무료) + 슬롯 구매 수**로 계산한다. 슬롯 결제는 패스 RPC와 같은 패턴의 전용 `SECURITY DEFINER` RPC(원자 차감)로 하고, 관계 생성 자체는 기존 POST가 담당하되 허용량을 게이트한다. GET은 1:N 아래에서도 기존 화면이 안 깨지게 "가장 최근 관계 1개"를 반환한다(하위호환).

**Tech Stack:** Next.js 16 route handlers · Supabase(PostgreSQL RPC) · node:test + tsx

**Spec:** `docs/superpowers/specs/2026-08-03-우리사이-시뮬레이션-design.md` §4(대상 관리·슬롯), §8(과금)

---

## File Structure

- **Create** `supabase/migrations/20260803000000_relationship_1n_slots.sql` — unique index 제거 + 슬롯 결제 RPC
- **Modify** `lib/relationship/types.ts` — `SLOT_COST` 상수 + `slotAllowance()` 순수 함수
- **Create** `lib/relationship/slots.ts` — `getSlotInfo()` 조회 + `purchaseSlot()` RPC 래퍼
- **Create** `lib/relationship/slots.test.ts` — `slotAllowance()` 유닛 테스트
- **Modify** `app/api/relationship/route.ts` — POST 멱등 제거→슬롯 게이트 · GET 하위호환(최근 1개)
- **Create** `app/api/relationship/slot/route.ts` — 슬롯 구매 엔드포인트

**테스트 정책:** 순수 함수(`slotAllowance`)만 node:test 유닛으로 검증한다. DB 의존 함수(`getSlotInfo`/`purchaseSlot`)와 RPC·route는 기존 프로젝트 관행대로 유닛 테스트하지 않고, dev 배포 후 실제 호출로 검증한다(기존 `passes.ts`엔 테스트가 순수 매핑뿐이다).

⚠️ **`SLOT_COST` 초기값은 미확정**(스펙 §11 가격 튜닝). 아래 Task 1은 초기값 `50`으로 상수를 정의하되, **실행 전 오너에게 확정**받는다(플랜 하단 handoff 참조).

---

### Task 1: `slotAllowance()` 순수 함수 + `SLOT_COST` 상수 (TDD)

**Files:**
- Create: `lib/relationship/slots.test.ts`
- Modify: `lib/relationship/types.ts` (파일 끝에 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — `lib/relationship/slots.test.ts`

```ts
// lib/relationship/slots.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotAllowance } from "./types.ts";

test("슬롯 허용량 = 1(무료) + 구매 수", () => {
  assert.equal(slotAllowance(0), 1);   // 구매 0 → 첫 상대만
  assert.equal(slotAllowance(1), 2);   // 슬롯 1 구매 → 2명
  assert.equal(slotAllowance(3), 4);
});

test("음수 방어", () => {
  assert.equal(slotAllowance(-5), 1);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --import tsx --test lib/relationship/slots.test.ts`
Expected: FAIL — `slotAllowance` is not exported (SyntaxError/undefined)

- [ ] **Step 3: 최소 구현** — `lib/relationship/types.ts` 파일 **맨 끝**에 추가

```ts
/** 관계 슬롯 — 1번째 상대는 무료, 2번째부터 슬롯 구매. 허용 관계 수 = 1 + 구매 수.
 * SLOT_COST 는 서버 권위(클라가 보낸 값 신뢰 X). 값은 튜닝 대상(스펙 §11). */
export const SLOT_COST = 50;

export function slotAllowance(purchasedSlots: number): number {
  return 1 + Math.max(0, purchasedSlots);
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --import tsx --test lib/relationship/slots.test.ts`
Expected: PASS — `ℹ pass 2` / `ℹ fail 0`

- [ ] **Step 5: 커밋**

```bash
git add lib/relationship/types.ts lib/relationship/slots.test.ts
git commit -m "feat(relationship): 관계 슬롯 허용량 순수 함수 + SLOT_COST"
```

---

### Task 2: DB 마이그레이션 — unique index 제거 + 슬롯 RPC

**Files:**
- Create: `supabase/migrations/20260803000000_relationship_1n_slots.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 20260803000000_relationship_1n_slots.sql — 우리 사이 1:N 전환 + 관계 슬롯
-- 1) 유저당 1관계 강제하던 unique index 제거 → 다중 상대 허용
DROP INDEX IF EXISTS idx_relationships_user_one;
CREATE INDEX IF NOT EXISTS idx_relationships_user
  ON relationships(user_id, last_visited_at DESC);

-- 2) 슬롯 구매 RPC — 별 원자 차감 + 기록(source='relationship_slot').
--    관계 생성은 하지 않는다(허용량만 늘림, 생성은 POST /api/relationship).
CREATE OR REPLACE FUNCTION purchase_relationship_slot(
  p_user_id UUID, p_cost INT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT; v_new_balance INT;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid');
  END IF;
  SELECT balance INTO v_balance FROM star_balances WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO star_balances (user_id, balance, total_earned, total_spent)
      VALUES (p_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;
  IF v_balance < p_cost THEN
    RETURN json_build_object('success', false, 'reason', 'insufficient', 'balance_after', v_balance);
  END IF;
  v_new_balance := v_balance - p_cost;
  UPDATE star_balances SET balance = v_new_balance, total_spent = total_spent + p_cost, updated_at = now()
    WHERE user_id = p_user_id;
  INSERT INTO star_transactions (user_id, type, amount, balance_after, source)
    VALUES (p_user_id, 'spend', p_cost, v_new_balance, 'relationship_slot');
  RETURN json_build_object('success', true, 'balance_after', v_new_balance);
END; $$;

-- 🔴 새 SECURITY DEFINER RPC — REVOKE 3종(PUBLIC·anon·authenticated) 필수(AGENTS.md).
--    함수별 정확한 인자로 지정(PostgREST 인자 불일치는 404, 회수 먹으면 401).
REVOKE EXECUTE ON FUNCTION purchase_relationship_slot(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purchase_relationship_slot(UUID, INT) TO service_role;
```

- [ ] **Step 2: RPC 본문을 적용 전 dev에서 실행해 문법·컬럼 검증** (AGENTS.md 교훈 ①: 파일의 모든 함수 본문을 적용 전 실행)

`star_balances`·`star_transactions` 컬럼명이 본문과 맞는지 dev DB에서 `CREATE OR REPLACE FUNCTION ...` 블록만 떼어 실행. 에러 없으면 통과. (컬럼 참조: `star_transactions(user_id,type,amount,balance_after,source)` — 기존 `purchase_relationship_pass` RPC와 동일 스키마)

- [ ] **Step 3: 커밋** (push는 실행자 판단 — dev push 시 Supabase dev 자동 적용)

```bash
git add supabase/migrations/20260803000000_relationship_1n_slots.sql
git commit -m "feat(relationship): 1:N unique index 제거 + 슬롯 결제 RPC"
```

- [ ] **Step 4: dev 배포 후 슬롯 회수 확인** (Task 5 완료 후 함께 — 임시 카나리아 대신 실제 slot route 로 검증)

dev push → `origin/main` Workflow SUCCESS 확인 → 슬롯 route(Task 5)로 실제 구매 1회 → `star_transactions`에 `source='relationship_slot'` 행 1개 + `star_balances.balance` 가 `SLOT_COST` 만큼 감소했는지 `scripts/run-prod-query.mjs`(read_only) 로 조회.

---

### Task 3: `slots.ts` — 슬롯 조회/구매 래퍼

**Files:**
- Create: `lib/relationship/slots.ts`

- [ ] **Step 1: 래퍼 작성**

```ts
// lib/relationship/slots.ts — 관계 슬롯 조회/구매 (DB 래퍼)
import { getServiceSupabase } from "@/lib/supabase";
import { SLOT_COST, slotAllowance } from "./types";

/** 유저 슬롯 현황: 허용 관계 수 / 현재 관계 수 / 무료로 더 추가 가능한지 / 다음 슬롯 가격. */
export async function getSlotInfo(userId: string): Promise<{
  allowed: number; used: number; canAddFree: boolean; nextCost: number;
}> {
  const supabase = getServiceSupabase();
  const [{ count: purchased }, { count: used }] = await Promise.all([
    supabase.from("star_transactions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("source", "relationship_slot"),
    supabase.from("relationships").select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const allowed = slotAllowance(purchased ?? 0);
  const usedN = used ?? 0;
  return { allowed, used: usedN, canAddFree: usedN < allowed, nextCost: SLOT_COST };
}

/** 슬롯 구매 — RPC 래퍼(원자 차감). 관계 생성은 호출측(POST)에서. */
export async function purchaseSlot(userId: string): Promise<{
  success: boolean; balance: number; reason?: string;
}> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("purchase_relationship_slot", {
    p_user_id: userId, p_cost: SLOT_COST,
  });
  if (error) return { success: false, balance: 0, reason: "rpc_error" };
  return { success: !!data.success, balance: data.balance_after ?? 0, reason: data.reason };
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0 (기존 `passes.ts`와 동일한 import·supabase 패턴)

- [ ] **Step 3: 커밋**

```bash
git add lib/relationship/slots.ts
git commit -m "feat(relationship): 슬롯 조회(getSlotInfo)·구매(purchaseSlot) 래퍼"
```

---

### Task 4: POST route — 멱등 제거 → 슬롯 허용량 게이트

**Files:**
- Modify: `app/api/relationship/route.ts:6-8`(import) · `:77-80`(멱등 블록)

- [ ] **Step 1: import 추가** — 파일 상단 import 블록(`route.ts:7` 아래)에 추가

```ts
import { getSlotInfo } from "@/lib/relationship/slots";
```

- [ ] **Step 2: 멱등 블록을 슬롯 게이트로 교체** — 기존 `route.ts:77-80`

교체 대상(기존):
```ts
  // v1 단일 관계 — 이미 있으면 그대로 반환(멱등)
  const { data: existing } = await supabase
    .from("relationships").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, existed: true });
```

교체 후(신규):
```ts
  // 슬롯 게이트 — 허용 관계 수(1 무료 + 구매 슬롯)를 넘으면 슬롯 구매 필요
  const slot = await getSlotInfo(userId);
  if (slot.used >= slot.allowed) {
    return NextResponse.json(
      { error: "slot_required", code: "SLOT_REQUIRED", nextCost: slot.nextCost },
      { status: 402 }
    );
  }
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 4: 커밋**

```bash
git add app/api/relationship/route.ts
git commit -m "feat(relationship): POST 멱등 제거 → 슬롯 허용량 게이트(402 SLOT_REQUIRED)"
```

---

### Task 5: 슬롯 구매 API route

**Files:**
- Create: `app/api/relationship/slot/route.ts`

- [ ] **Step 1: route 작성**

```ts
// app/api/relationship/slot/route.ts — 관계 슬롯 구매(2번째 상대부터)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { purchaseSlot, getSlotInfo } from "@/lib/relationship/slots";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  const res = await purchaseSlot(userId);
  if (!res.success) {
    const status = res.reason === "insufficient" ? 402 : 500;
    return NextResponse.json({ error: res.reason ?? "failed", balance: res.balance }, { status });
  }
  const slot = await getSlotInfo(userId);
  return NextResponse.json({
    success: true, balance: res.balance, allowed: slot.allowed, used: slot.used,
  });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0 (`getSession` 시그니처는 `route.ts`의 기존 사용과 동일)

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/slot/route.ts
git commit -m "feat(relationship): 슬롯 구매 엔드포인트 POST /api/relationship/slot"
```

---

### Task 6: GET route — 1:N 하위호환 (최근 1개 반환)

**Files:**
- Modify: `app/api/relationship/route.ts:18-22`(GET 조회)

- [ ] **Step 1: `maybeSingle()` 조회를 "최근 1개"로 변경** — 여러 행이면 `maybeSingle()`이 에러이므로 정렬 후 `limit(1)`

교체 대상(기존 `route.ts:18-22`):
```ts
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status, self_profile_id, partner_profile_id, thread_reading_id, memo, last_visited_at")
    .eq("user_id", userId)
    .maybeSingle();
```

교체 후:
```ts
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status, self_profile_id, partner_profile_id, thread_reading_id, memo, last_visited_at")
    .eq("user_id", userId)
    .order("last_visited_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
```

- [ ] **Step 2: 타입 체크 + 회귀 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0. (반환 형태 불변 — 기존 화면 그대로 동작. 다중 관계여도 최근 1개만 노출 = P2 전까지 하위호환)

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/route.ts
git commit -m "fix(relationship): GET 1:N 하위호환 — 최근 관계 1개 반환"
```

---

## Self-Review

**1. Spec coverage (§4 대상 관리·§8 과금 백엔드):**
- 1:N 전환 → Task 2(index 제거) ✅
- 관계 슬롯(첫 무료·추가 별) → Task 1(허용량)·2(RPC)·3(래퍼)·4(게이트)·5(구매) ✅
- 상태 변화=같은 파일 → 기존 PATCH 그대로(변경 없음), 이 플랜 범위 밖(스펙 §4에 "현행 PATCH 그대로") ✅
- 화면(파일 허브·상대 목록) → **P2**(범위 밖, GET 하위호환으로 기존 화면 유지) ✅

**2. Placeholder scan:** `SLOT_COST=50`은 실제 상수(빈 TBD 아님)이며 값 튜닝은 handoff에 명시. 그 외 모든 스텝에 실제 코드/명령 있음. ✅

**3. Type consistency:** `slotAllowance(purchasedSlots:number):number`(Task1) → `getSlotInfo`가 사용(Task3) · `getSlotInfo` 반환 `{allowed,used,canAddFree,nextCost}` → Task4(`slot.used`,`slot.allowed`,`slot.nextCost`)·Task5(`slot.allowed`,`slot.used`)에서 동일 필드 참조 · `purchaseSlot` 반환 `{success,balance,reason}` → Task5에서 `res.success`,`res.reason`,`res.balance` 동일. ✅

**주의(구현자):** Task 2의 마이그레이션은 dev push 전 **본문을 dev에서 실행**해 컬럼·문법을 검증할 것(파일 단위 실패 방지). 슬롯 RPC는 `service_role` 전용이라 `run-prod-query.mjs` 직접 호출은 permission denied 가 정상 — 검증은 Task 5 route 경유(실제 구매 후 행 확인).

---

## 미확정 (실행 전 오너 확인)

- **`SLOT_COST` 초기값** — 현재 `50`으로 두었으나 스펙 §11 "슬롯 가격 튜닝(시뮬 판매 벽 안 되게)" 미해결. 웰컴 20별과의 관계(웰컴으로 첫 슬롯 살 수 있게 하려면 20 이하)도 함께 결정 필요.
