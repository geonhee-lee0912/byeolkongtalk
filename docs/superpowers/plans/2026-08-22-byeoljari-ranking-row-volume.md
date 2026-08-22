# 별자리 순위 행 볼륨업 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 별자리 인연 순위 목록의 각 행을 풀카드로(오행배지·일간유형·관계역할·오행쌍·메타포 줄글) 볼륨업하고, 펼침에 멤버 삭제를 추가한다.

**Architecture:** 순수 로직 2모듈(일간유형·관계역할/메타포)을 TDD로 만들고, 일간유형만 서버(`[shareId]/route.ts`)에서 기존 `calcSaju` 결과로 노드에 주입한다(DB 변경 없음). 관계역할·오행쌍·메타포는 클라 순수함수로 렌더 시 조립. 멤버 삭제는 신규 owner-검증 DELETE 라우트 + 아코디언 인라인 확인.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase(service_role), node:test.

스펙: `docs/superpowers/specs/2026-08-22-byeoljari-ranking-row-volume-design.md`

---

## File Structure

- Create `lib/byeoljari/day-type.ts` — 일간(천간)+월지→"여름 큰산형". 순수.
- Create `lib/byeoljari/day-type.test.ts`
- Create `lib/byeoljari/relation-role.ts` — 관계역할·오행쌍(토생금)·메타포 줄글. 순수.
- Create `lib/byeoljari/relation-role.test.ts`
- Modify `lib/byeoljari/types.ts` — `GraphNode` += `dayType: string`
- Modify `app/api/fortune/byeoljari/[shareId]/route.ts` — 노드에 `dayType` 주입
- Create `app/api/fortune/byeoljari/[shareId]/members/[memberId]/route.ts` — DELETE
- Modify `components/byeoljari/InyeonDetail.tsx` — `showProse` prop(기본 true)
- Modify `components/byeoljari/ConstellationView.tsx` — 순위 useMemo 보강 + 풀카드 행 + 삭제 배선

포맷 실측 완료(구현 시 재확인 불필요): `calcSaju().dayStem`="신"·`pillars.month.branch`="오"·`dayElement`="금" 전부 **한글 단일자**. 1990-06-15 → "여름 보석형".

---

## Task 1: 일간 유형 순수 모듈 (day-type)

**Files:**
- Create: `lib/byeoljari/day-type.ts`
- Test: `lib/byeoljari/day-type.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju } from "../saju/calc.ts";
import { dayType } from "./day-type.ts";

test("dayType — 계절+유형 결합", () => {
  assert.equal(dayType("신", "오"), "여름 보석형");
  assert.equal(dayType("무", "인"), "봄 큰산형");
  assert.equal(dayType("갑", "자"), "겨울 큰나무형");
  assert.equal(dayType("경", "유"), "가을 원석형");
});

test("dayType — 미지 폴백", () => {
  assert.equal(dayType("?", "오"), "여름 별 유형");
  assert.equal(dayType("신", "?"), "보석형");
});

test("dayType — 실제 calcSaju 출력으로 키 포맷 검증(폴백 아님)", () => {
  const r = calcSaju({ year: 1990, month: 6, day: 15, hour: 10, minute: 0, gender: "other" });
  assert.equal(dayType(r.dayStem, r.pillars.month.branch), "여름 보석형");
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/byeoljari/day-type.test.ts`
Expected: FAIL (`dayType` not found)

- [ ] **Step 3: 구현**

```ts
// 일간(일주 천간) + 월지 → 사람 유형 라벨. 순수. calcSaju().dayStem·pillars.month.branch(한글 단일자) 입력.
// 천간 "신"(辛)=보석형 / 지지 "신"(申)=가을 — 맵이 분리돼 충돌 없음.
const ARCHETYPE: Record<string, string> = {
  갑: "큰나무형", 을: "화초형", 병: "태양형", 정: "등불형", 무: "큰산형",
  기: "텃밭형", 경: "원석형", 신: "보석형", 임: "큰바다형", 계: "이슬형",
};

const SEASON: Record<string, string> = {
  인: "봄", 묘: "봄", 진: "봄",
  사: "여름", 오: "여름", 미: "여름",
  신: "가을", 유: "가을", 술: "가을",
  해: "겨울", 자: "겨울", 축: "겨울",
};

/** "여름 큰산형". 계절 미상이면 유형만, 일간 미상이면 "별 유형". */
export function dayType(dayStem: string, monthBranch: string): string {
  const arche = ARCHETYPE[dayStem] ?? "별 유형";
  const season = SEASON[monthBranch];
  return season ? `${season} ${arche}` : arche;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/byeoljari/day-type.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/byeoljari/day-type.ts lib/byeoljari/day-type.test.ts
git commit -m "feat(byeoljari): 일간 유형 순수 모듈(dayType) — 계절+천간 유형"
```

---

## Task 2: 관계역할·오행쌍·메타포 순수 모듈 (relation-role)

**Files:**
- Create: `lib/byeoljari/relation-role.ts`
- Test: `lib/byeoljari/relation-role.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { relationRole, elementPair, metaphorProse } from "./relation-role.ts";

test("relationRole — 톤 C 역할 라벨", () => {
  assert.equal(relationRole("생아"), "곁에서 힘이 되는 인연");
  assert.equal(relationRole("아극"), "내가 이끌어 가는 인연");
  assert.equal(relationRole("비화"), "결이 닮은 인연");
  assert.equal(relationRole("?"), "이어져 있는 인연");
});

test("elementPair — 오행쌍 한글+한자", () => {
  assert.equal(elementPair("생아", "금", "토"), "토생금(土生金)"); // 나=금, 상대=토, 상대생나
  assert.equal(elementPair("아극", "금", "목"), "금극목(金剋木)"); // 나=금이 상대=목을 극
  assert.equal(elementPair("비화", "금", "금"), "같은 금(金)");
});

test("metaphorProse — 오행 이미지 메타포(조사 포함)", () => {
  assert.equal(
    metaphorProse("생아", "금", "토"),
    "흙이 쇠를 살리듯, 곁에 있으면 기운이 차오르는 사이야"
  );
  assert.equal(
    metaphorProse("아극", "금", "목"),
    "쇠가 나무를 다루듯, 내가 이끌어 가는 흐름이야"
  );
  assert.equal(
    metaphorProse("비화", "금", "금"),
    "같은 쇠처럼 닮아, 말 안 해도 통하는 사이야"
  );
  assert.equal(metaphorProse("생아", "?", "토"), "이어져 있는 사이야"); // 미지 오행 폴백
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --import tsx --test lib/byeoljari/relation-role.test.ts`
Expected: FAIL (함수 없음)

- [ ] **Step 3: 구현**

```ts
// 나(pivot) 기준 관계 역할 라벨 + 오행쌍 표기 + 메타포 줄글. 순수.
// oriented.element(생아|아생|극아|아극|비화) + 나/상대 오행(목화토금수).

const ROLE: Record<string, string> = {
  생아: "곁에서 힘이 되는 인연",
  아생: "내가 마음 쓰게 되는 인연",
  극아: "서로 긴장을 주고받는 인연",
  아극: "내가 이끌어 가는 인연",
  비화: "결이 닮은 인연",
};

export function relationRole(element: string): string {
  return ROLE[element] ?? "이어져 있는 인연";
}

const HANJA: Record<string, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

// A=작용(생/극하는) 오행, B=받는 오행. 생아·극아는 상대가 A, 아생·아극은 나가 A.
function actReceive(
  relation: string,
  myEl: string,
  otherEl: string
): { a: string; b: string; verb: "생" | "극" } | null {
  switch (relation) {
    case "생아": return { a: otherEl, b: myEl, verb: "생" };
    case "아생": return { a: myEl, b: otherEl, verb: "생" };
    case "극아": return { a: otherEl, b: myEl, verb: "극" };
    case "아극": return { a: myEl, b: otherEl, verb: "극" };
    default: return null; // 비화
  }
}

/** "토생금(土生金)". 비화는 "같은 금(金)". 미지 오행이면 한자 괄호 생략. */
export function elementPair(relation: string, myEl: string, otherEl: string): string {
  if (relation === "비화") {
    const h = HANJA[myEl];
    return h ? `같은 ${myEl}(${h})` : `같은 ${myEl}`;
  }
  const ar = actReceive(relation, myEl, otherEl);
  if (!ar) return "";
  const ha = HANJA[ar.a];
  const hb = HANJA[ar.b];
  const hanjaVerb = ar.verb === "생" ? "生" : "剋";
  const paren = ha && hb ? `(${ha}${hanjaVerb}${hb})` : "";
  return `${ar.a}${ar.verb}${ar.b}${paren}`;
}

// 오행 이미지 + 조사(주격, 목적격). 5개 고정이라 정규식 josa 불필요.
const IMG: Record<string, { w: string; subj: string; obj: string }> = {
  목: { w: "나무", subj: "가", obj: "를" },
  화: { w: "불", subj: "이", obj: "을" },
  토: { w: "흙", subj: "이", obj: "을" },
  금: { w: "쇠", subj: "가", obj: "를" },
  수: { w: "물", subj: "이", obj: "을" },
};

const TAIL: Record<string, string> = {
  생아: "살리듯, 곁에 있으면 기운이 차오르는 사이야",
  아생: "키우듯, 내가 마음을 쓰게 되는 사이야",
  극아: "다잡듯, 팽팽하게 마주 서는 사이야",
  아극: "다루듯, 내가 이끌어 가는 흐름이야",
};

/** "흙이 쇠를 살리듯, 곁에 있으면 기운이 차오르는 사이야". 비화 특례. 미지 폴백. */
export function metaphorProse(relation: string, myEl: string, otherEl: string): string {
  if (relation === "비화") {
    const img = IMG[myEl];
    return img ? `같은 ${img.w}처럼 닮아, 말 안 해도 통하는 사이야` : "결이 닮아 통하는 사이야";
  }
  const ar = actReceive(relation, myEl, otherEl);
  const ia = ar ? IMG[ar.a] : undefined;
  const ib = ar ? IMG[ar.b] : undefined;
  const tail = TAIL[relation];
  if (!ar || !ia || !ib || !tail) return "이어져 있는 사이야";
  return `${ia.w}${ia.subj} ${ib.w}${ib.obj} ${tail}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --import tsx --test lib/byeoljari/relation-role.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/byeoljari/relation-role.ts lib/byeoljari/relation-role.test.ts
git commit -m "feat(byeoljari): 관계역할·오행쌍·메타포 순수 모듈(relation-role)"
```

---

## Task 3: GraphNode.dayType 추가 + API 주입

**Files:**
- Modify: `lib/byeoljari/types.ts`
- Modify: `app/api/fortune/byeoljari/[shareId]/route.ts:66-72` (노드 빌드)

- [ ] **Step 1: 타입에 dayType 추가**

`lib/byeoljari/types.ts` 의 `GraphNode` 인터페이스에 필드 추가:

```ts
export interface GraphNode {
  id: string;
  name: string | null;
  isHost: boolean;
  relationType: string;
  element: FiveElement;
  dayType: string; // "여름 큰산형" — 일간(천간)+월지
}
```

- [ ] **Step 2: API 라우트에서 dayType import + 주입**

`app/api/fortune/byeoljari/[shareId]/route.ts` 상단 import 추가(기존 import 블록 뒤):

```ts
import { dayType } from "@/lib/byeoljari/day-type";
```

노드 빌드(현재 66-72줄)를 교체:

```ts
  const nodes = members.map((m, i) => ({
    id: m.id,
    name: m.name_public ? m.display_name : null, // 옵트인 아니면 이름 숨김(별만)
    isHost: m.is_host,
    relationType: m.relation_type,
    element: saju[i].dayElement,
    dayType: dayType(saju[i].dayStem, saju[i].pillars.month.branch),
  }));
```

- [ ] **Step 3: 검증 (tsc + 실렌더)**

```bash
npx tsc --noEmit
```
Expected: no output

브라우저(dev): `http://localhost:3000/fortune/byeoljari/7uBv0cLKet` 로드 후 콘솔에서
`document.querySelector('svg')` 존재 확인 + 네트워크 응답의 nodes[0].dayType 가 "…형" 문자열인지(폴백 "별 유형" 아님) 확인. (아직 UI 표시는 Task 6.)

- [ ] **Step 4: 커밋**

```bash
git add lib/byeoljari/types.ts "app/api/fortune/byeoljari/[shareId]/route.ts"
git commit -m "feat(byeoljari): GraphNode.dayType 추가 + API 주입(기존 calcSaju 재사용)"
```

---

## Task 4: 멤버 삭제 DELETE 엔드포인트

**Files:**
- Create: `app/api/fortune/byeoljari/[shareId]/members/[memberId]/route.ts`

- [ ] **Step 1: DELETE 라우트 작성**

```ts
// 별자리 멤버 삭제 — 주인(owner)만. 호스트(나) 삭제 금지.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shareId: string; memberId: string }> }
) {
  const { shareId, memberId } = await params;
  const { userId, anonymousId } = await getSession();
  if (!anonymousId) {
    return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
  }

  const supa = getServiceSupabase();
  const { data: map } = await supa
    .from("star_maps")
    .select("id, owner_user_id, creator_anon_id")
    .eq("share_id", shareId)
    .maybeSingle();
  if (!map) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // 주인 검증: 로그인 맵=owner_user_id 일치 / 비로그인 맵=creator_anon_id 일치
  const isOwner = map.owner_user_id
    ? map.owner_user_id === userId
    : map.creator_anon_id === anonymousId;
  if (!isOwner) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { data: member } = await supa
    .from("star_map_members")
    .select("id, map_id, is_host")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.map_id !== map.id) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (member.is_host) {
    return NextResponse.json({ ok: false, reason: "host" }, { status: 409 });
  }

  const { error } = await supa.from("star_map_members").delete().eq("id", memberId);
  if (error) {
    await logError(error, {
      route: "/api/fortune/byeoljari/[shareId]/members/[memberId]",
      userId,
      extra: { severity: "BYEOLJARI_MEMBER_DELETE_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 검증**

```bash
npx tsc --noEmit
```
Expected: no output

프로브(비주인 차단 확인): 다른 anon 쿠키로 `DELETE /api/fortune/byeoljari/7uBv0cLKet/members/<guestId>` → 403. 주인 세션(dev 로엔)으로 임시 게스트 삭제 → 200 + 목록에서 사라짐. (Task 6 UI 완료 후 브라우저로 최종 확인.)

- [ ] **Step 3: 커밋**

```bash
git add "app/api/fortune/byeoljari/[shareId]/members/[memberId]/route.ts"
git commit -m "feat(byeoljari): 멤버 삭제 DELETE 라우트(owner 검증·호스트 금지)"
```

---

## Task 5: InyeonDetail 에 showProse prop

**Files:**
- Modify: `components/byeoljari/InyeonDetail.tsx`

포커스 카드 ②(이웃 목록)는 줄글 유지, 순위 아코디언은 줄글이 행에 있으니 `showProse={false}` 로 끈다.

- [ ] **Step 1: Props + 렌더 가드 추가**

`Props` 인터페이스에 추가:

```ts
  pivotIsMe?: boolean;
  triadShared?: boolean;
  showProse?: boolean;
```

함수 시그니처 구조분해에 `showProse = true` 추가:

```ts
export default function InyeonDetail({ target, oriented, inyeon, pivotIsMe = true, triadShared = false, showProse = true }: Props) {
```

prose `<p>` 를 가드로 감싼다(현재 `<p className="text-sm text-eye-purple">{rd.prose}</p>`):

```tsx
      {showProse && <p className="text-sm text-eye-purple">{rd.prose}</p>}
```

- [ ] **Step 2: 검증**

```bash
npx tsc --noEmit
```
Expected: no output

- [ ] **Step 3: 커밋**

```bash
git add components/byeoljari/InyeonDetail.tsx
git commit -m "feat(byeoljari): InyeonDetail showProse prop(순위 행 중복 제거용)"
```

---

## Task 6: ConstellationView 풀카드 행 + 삭제 배선

**Files:**
- Modify: `components/byeoljari/ConstellationView.tsx`

- [ ] **Step 1: import + 상태 + myEl 추가**

import 블록에 추가(기존 `InyeonDetail` import 근처):

```ts
import { relationRole, elementPair, metaphorProse } from "@/lib/byeoljari/relation-role";
import { useRouter } from "next/navigation";
```

`ConstellationView` 함수 본문 상단 상태 블록(기존 `useState` 들 근처)에 추가:

```ts
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
```

`pivotId` 정의 아래에 나(pivot) 오행 + 소유자 여부:

```ts
  const myEl = pivotId ? graph.nodes.find((n) => n.id === pivotId)?.element ?? "" : "";
  const isOwner = meId != null && meId === host?.id; // 뷰어=호스트(맵 주인)일 때만 삭제 노출
```

(`host` 는 기존 `const host = graph.nodes.find((n) => n.isHost) ?? graph.nodes[0];` 재사용.)

- [ ] **Step 2: 순위 useMemo 에 element·dayType·relation 추가**

현재 useMemo 의 `return { id, name, inyeon, special }` 를 교체:

```ts
      .map((e) => {
        const otherId = e.a === pivotId ? e.b : e.a;
        const other = graph.nodes.find((n) => n.id === otherId);
        const oriented = orientEdge(e, pivotId);
        const special =
          (e.heavenlyCombo ? 1 : 0) + (e.sixCombo ? 1 : 0) + (e.triadShared ? 1 : 0);
        return {
          id: otherId,
          name: other?.name ?? null,
          element: other?.element ?? "",
          dayType: other?.dayType ?? "",
          relation: oriented?.element ?? "",
          inyeon: e.inyeon,
          special,
        };
      })
```

- [ ] **Step 3: 삭제 핸들러 추가**

`resetToOverview` 함수 근처에 추가:

```ts
  async function handleDeleteMember(memberId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/fortune/byeoljari/${graph.shareId}/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        router.refresh();
        window.location.reload(); // 그래프는 클라 fetch라 확실히 재조회
      } else {
        setDeleting(false);
        setConfirmDeleteId(null);
      }
    } catch {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }
```

- [ ] **Step 4: 순위 행 블록 교체 (풀카드)**

현재 `{ranking.map((r, i) => { ... })}` 의 반환 `<div key={r.id}> … </div>` 전체(현재 354-393줄)를 교체:

```tsx
              return (
                <div
                  key={r.id}
                  className={`overflow-hidden rounded-2xl ${top ? "bg-night text-cream-warm" : "bg-cream-warm"}`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      setListOpenId((cur) => (cur === r.id ? null : r.id));
                      setConfirmDeleteId(null);
                      resetToOverview();
                    }}
                    className={`block w-full px-4 py-3 text-left transition active:scale-[0.99] ${
                      top ? "hover:bg-white/5" : "hover:bg-lilac-soft/40"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${top ? "bg-gold text-night" : "bg-lilac-soft text-eye-purple"}`}>
                        {i + 1}
                      </span>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                        style={{ backgroundColor: STAR_ELEMENT_COLORS[r.element as keyof typeof STAR_ELEMENT_COLORS] ?? "#B8A8D8", color: "#1F1735" }}
                      >
                        {r.element}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${top ? "text-cream-warm" : "text-eye-purple"}`}>
                          {r.name ?? "이 별"}
                        </span>
                        {r.dayType && (
                          <span className={`block truncate text-xs ${top ? "text-lilac-soft" : "text-text-light"}`}>
                            {r.dayType}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block font-display text-lg font-bold leading-none ${top ? "text-gold" : "text-eye-purple"}`}>
                          {r.inyeon}
                        </span>
                        <span className={`mt-0.5 block text-[11px] ${top ? "text-lilac-soft" : "text-text-light"}`}>
                          인연 점수
                        </span>
                      </span>
                    </span>
                    <span className={`mt-2.5 block border-t pt-2.5 ${top ? "border-white/15" : "border-lilac-soft"}`}>
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${gradeChipClass(grade.tone)}`}>
                          {grade.label}
                        </span>
                        <span className={`text-xs ${top ? "text-cream-warm" : "text-eye-purple"}`}>
                          {relationRole(r.relation)} · {elementPair(r.relation, myEl, r.element)}
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-[12.5px] leading-relaxed ${top ? "text-[#D9CFF0]" : "text-eye-purple"}`}>
                        {metaphorProse(r.relation, myEl, r.element)}
                      </span>
                    </span>
                  </button>
                  {open && rowDetail?.target && (
                    <div ref={detailRef} className="animate-fade-in scroll-mb-20 px-4 pb-4 pt-1">
                      <InyeonDetail
                        target={rowDetail.target}
                        oriented={rowDetail.oriented}
                        heavenlyCombo={rowDetail.edge?.heavenlyCombo ?? false}
                        sixCombo={rowDetail.edge?.sixCombo ?? false}
                        inyeon={rowDetail.inyeonInfo}
                        showProse={false}
                      />
                      {isOwner && !rowDetail.target.isHost && (
                        confirmDeleteId === r.id ? (
                          <span className="mt-3 flex items-center gap-2 text-sm">
                            <span className="text-text-light">이 별을 지도에서 지울까?</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-lilac-mid/40 px-3 py-1 text-xs text-eye-purple"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteMember(r.id)}
                              className="rounded-full bg-[#D85A30] px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              {deleting ? "지우는 중…" : "지우기"}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="mt-3 text-xs text-text-light underline underline-offset-2"
                          >
                            지우기
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
```

- [ ] **Step 5: 검증 (tsc + 브라우저)**

```bash
npx tsc --noEmit
```
Expected: no output

브라우저(dev 로엔 `7uBv0cLKet`, 모바일 375):
- 전 행 풀카드 렌더(오행배지 색·일간유형·관계역할·오행쌍·메타포 줄글), 1위 다크 히어로.
- 행 탭 → 펼침(InyeonDetail 줄글 없음 = 중복 없음) + 하단 "지우기".
- "지우기" 탭 → "이 별을 지도에서 지울까? 취소/지우기" 인라인.
- 임시 게스트 하나 만들고 삭제 → 성공 후 목록/지도에서 사라짐. 호스트(나)엔 지우기 미노출.
- 콘솔 에러 0 (fresh 탭으로 확인 — HMR stale 무시).

- [ ] **Step 6: 커밋**

```bash
git add components/byeoljari/ConstellationView.tsx
git commit -m "feat(byeoljari): 순위 행 풀카드(일간유형·관계역할·메타포) + 멤버 지우기"
```

---

## Self-Review

- **스펙 커버리지:** 전 행 풀카드(T6) · 일간유형(T1,T3) · 관계역할 톤C/오행쌍/메타포(T2,T6) · 아코디언 줄글 중복 제거(T5,T6) · 지우기 owner·비호스트·확인(T4,T6) · 인연점수 명칭 유지(T6). 전 항목 태스크 매핑됨.
- **플레이스홀더:** 없음(모든 스텝 실제 코드).
- **타입 일관성:** `dayType(string,string)` · `relationRole(string)` · `elementPair/metaphorProse(relation,myEl,otherEl)` · `GraphNode.dayType` · `showProse?` 전 태스크 시그니처 일치. `STAR_ELEMENT_COLORS` 키 캐스팅으로 인덱싱 크래시 방지.
- **범위:** 단일 플랜(2 순수모듈 + 1 타입 + 1 API필드 + 1 DELETE + 2 컴포넌트). 적정.

## 유의(구현자)
- 삭제 후 `window.location.reload()` 는 의도적 단순화(옵티미스틱 제거는 YAGNI). `router.refresh()` 만으론 클라 fetch 그래프가 안 갱신됨.
- `myEl` 은 pivot(나) 오행. 오행쌍/메타포는 항상 나 기준(생아=상대가 나를 생).
- 이번 배치엔 **미커밋 선행분**(#1 포커스 칩 유지 · #2 범례/선 개선 · 엣지 stable key)이 워킹트리에 있음 — Task 커밋과 함께 최종 푸시. dev 한정(main 미머지).
