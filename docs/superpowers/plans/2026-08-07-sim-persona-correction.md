# 연애 시뮬 인형 페르소나 교정 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시뮬 인형 대사에 👍/👎 피드백을 붙여, 교정 내용을 상대 성격 프로필(`user_profiles.personality`)에 즉시 반영한다. 인형은 다음 턴부터 갱신된 성격으로 반응한다.

**Architecture:** 신규 `POST /api/relationship/sim/feedback` 라우트가 소유권 검증 후 `personality`를 append한다. 인형 반영은 별도 배선 불필요 — 기존 `sim/chat`의 `loadSim`이 매 `say` 턴 `personality`를 재조회하고 `buildDollSystemMessage`가 주입 중이라, 값만 바뀌면 다음 턴에 자동 반영된다. 프론트는 `SimBubble`에 피드백 버튼+인라인 입력을 얹고, `NightStage`가 전송을 배선한다. 유저 안내는 세션 생성 프레임 문구 + 무대 미니 목록.

**Tech Stack:** Next.js 16 route handler(nodejs), React 19 client component, Supabase service client, Vitest(순수 헬퍼 TDD).

**Spec:** `docs/superpowers/specs/2026-08-07-sim-persona-correction-design.md`

---

## File Structure

- `lib/relationship/sim.ts` — (수정) 순수 헬퍼 `appendPersonalityNote` 추가
- `lib/relationship/sim.test.ts` — (수정) 헬퍼 테스트
- `app/api/relationship/sim/feedback/route.ts` — (신규) 피드백 → personality append 라우트
- `app/api/relationship/sim/route.ts` — (수정) 세션 생성 프레임 문구에 교정 안내 한 줄
- `components/relationship/sim/SimBubble.tsx` — (수정) 👍/👎 버튼 + 인라인 입력
- `components/relationship/sim/NightStage.tsx` — (수정) 피드백 전송 배선 + 무대 미니 안내

---

## Task 1: personality append 순수 헬퍼 (TDD)

**Files:**
- Modify: `lib/relationship/sim.ts`
- Test: `lib/relationship/sim.test.ts`

기존 성격 서술에 피드백 노트를 한 줄(`· {note}`)로 덧붙이는 순수 함수. 빈 기존값·앞뒤 공백을 안전하게 처리한다. 저장·표시가 자연스럽도록 불릿 서술 형태로 누적한다.

- [ ] **Step 1: 실패 테스트 작성**

`lib/relationship/sim.test.ts` 파일 상단 import에 `appendPersonalityNote`를 추가하고(기존 import 구문에 병합), 파일 끝에 다음 describe를 추가:

```ts
import { appendPersonalityNote } from "./sim";

describe("appendPersonalityNote", () => {
  it("빈 기존값이면 불릿 한 줄로 시작한다", () => {
    expect(appendPersonalityNote(null, "사실 낯을 많이 가려")).toBe("· 사실 낯을 많이 가려");
    expect(appendPersonalityNote("", "낯가림")).toBe("· 낯가림");
    expect(appendPersonalityNote("   ", "낯가림")).toBe("· 낯가림");
  });

  it("기존값이 있으면 개행 + 불릿으로 덧붙인다", () => {
    expect(appendPersonalityNote("무뚝뚝함", "사실 다정해")).toBe("무뚝뚝함\n· 사실 다정해");
  });

  it("노트 앞뒤 공백을 정리한다", () => {
    expect(appendPersonalityNote("A", "  낯가림  ")).toBe("A\n· 낯가림");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/relationship/sim.test.ts`
Expected: FAIL — `appendPersonalityNote is not exported` / not a function.

- [ ] **Step 3: 최소 구현**

`lib/relationship/sim.ts` 끝(`formatPartnerForDoll` 다음)에 추가:

```ts
/** 상대 성격 서술에 피드백 노트를 불릿 한 줄로 append. 빈 기존값·공백 안전.
 *  시뮬 교정(👎 실제론 ~해 / 👍 이런 면이 걔다워)이 personality 로 누적되는 통로 —
 *  프로필 화면에도 그대로 노출되므로 서술형으로 쌓는다(스펙 2026-08-07). */
export function appendPersonalityNote(existing: string | null, note: string): string {
  const clean = note.trim();
  const base = (existing ?? "").trim();
  if (!clean) return base;
  return base ? `${base}\n· ${clean}` : `· ${clean}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/relationship/sim.test.ts`
Expected: PASS (기존 테스트 포함 전부 green).

- [ ] **Step 5: 커밋**

```bash
git add lib/relationship/sim.ts lib/relationship/sim.test.ts
git commit -m "feat(sim): personality append 순수 헬퍼(교정 누적)"
```

---

## Task 2: 피드백 라우트 (personality 즉시 반영)

**Files:**
- Create: `app/api/relationship/sim/feedback/route.ts`

인형 대사 피드백을 받아 상대 성격에 즉시 반영한다. `sim/chat`의 `loadSim`과 겹치는 로드는 이 라우트에서 최소한만 자체 수행한다(전면 공용화는 스코프 밖). `note`는 항상 필수 — 👍 스킵(맘에 듦만)은 프론트에서 서버를 호출하지 않는다(Task 3).

- [ ] **Step 1: 라우트 작성**

`app/api/relationship/sim/feedback/route.ts` 생성:

```ts
// app/api/relationship/sim/feedback/route.ts — 인형 대사 피드백(👍/👎) → 상대 성격 personality 즉시 반영.
// 인형은 다음 say 턴에 loadSim 이 갱신된 personality 를 재조회 → buildDollSystemMessage 가 자동 반영(별도 배선 없음).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import { appendPersonalityNote } from "@/lib/relationship/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTE_LEN = 300;

interface Body { simReadingId: string; kind: "up" | "down"; note?: string }

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "sim_feedback_session", key: userId, max: 30, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "sim_feedback_ip", key: ip, max: 60, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok)
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const kind = body.kind;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LEN) : "";
  if (!body.simReadingId || (kind !== "up" && kind !== "down") || !note)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, relationship_id, consultation_type")
    .eq("id", body.simReadingId)
    .maybeSingle();
  if (!reading || reading.user_id !== userId || reading.consultation_type !== "relationship_sim")
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: rel } = await supabase
    .from("relationships")
    .select("id, partner_profile_id")
    .eq("id", reading.relationship_id)
    .maybeSingle();
  if (!rel?.partner_profile_id)
    return NextResponse.json({ error: "no_profile", code: "NO_PROFILE" }, { status: 409 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("personality")
    .eq("id", rel.partner_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile)
    return NextResponse.json({ error: "no_profile", code: "NO_PROFILE" }, { status: 409 });

  const next = appendPersonalityNote(profile.personality ?? null, note);
  const { error: uErr } = await supabase
    .from("user_profiles")
    .update({ personality: next })
    .eq("id", rel.partner_profile_id)
    .eq("user_id", userId);
  if (uErr) {
    await logError(uErr, ctxFromRequest(request, { route: "/api/relationship/sim/feedback", userId, extra: { simReadingId: reading.id, kind } }));
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, personality: next });
}
```

- [ ] **Step 2: 타입 체크 + 빌드 라우트 인식 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/sim/feedback/route.ts
git commit -m "feat(sim): 인형 대사 피드백 라우트 — personality 즉시 반영"
```

---

## Task 3: 세션 프레임에 교정 안내 한 줄

**Files:**
- Modify: `app/api/relationship/sim/route.ts:95`

진입 시 별콩이 프레임 노트에 교정 기능 안내를 자연스럽게 한 줄 넣는다.

- [ ] **Step 1: 프레임 문구 수정**

`app/api/relationship/sim/route.ts`에서 아래 라인을:

```ts
  const frame = `별콩이가 ${rel.label} 인형을 데려왔어. 진짜 걔가 아니라 네 마음속 ${rel.label}야. 편하게 말 걸어봐. (지금은 "${situation.label}" 상황이야.)`;
```

다음으로 교체:

```ts
  const frame = `별콩이가 ${rel.label} 인형을 데려왔어. 진짜 걔가 아니라 네 마음속 ${rel.label}야. 편하게 말 걸어봐. 혹시 인형이 실제 걔랑 다르게 굴면 대사 밑 👍👎로 알려줘 — 내가 더 걔답게 만들어줄게. (지금은 "${situation.label}" 상황이야.)`;
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/sim/route.ts
git commit -m "feat(sim): 프레임 노트에 교정 기능 안내 한 줄"
```

---

## Task 4: SimBubble 피드백 버튼 + 인라인 입력

**Files:**
- Modify: `components/relationship/sim/SimBubble.tsx`

인형 대사 하단에 👍/👎. 👎는 교정 입력 필수, 👍는 이유 입력 선택(건너뛰기 시 서버 호출 없이 '맘에 듦'만 로컬 표시). `onFeedback`이 없으면(스트리밍 중 live 버블 등) 버튼을 렌더하지 않는다.

- [ ] **Step 1: 컴포넌트 재작성**

`components/relationship/sim/SimBubble.tsx` 전체를 교체:

```tsx
"use client";
// components/relationship/sim/SimBubble.tsx — 인형(상대) 대사 버블 + 페르소나 교정 피드백(👍/👎).
// 별콩이 각인 없음(ByeolkongNote 와 구분). onFeedback 없으면(스트리밍 live) 버튼 미표시.
import { useState } from "react";

export default function SimBubble({
  content,
  streaming,
  onFeedback,
}: {
  content: string;
  streaming?: boolean;
  /** (kind, note) → 저장 성공 여부. note 빈 문자열이면 호출부(👍 스킵)가 서버를 부르지 않으므로 여기 도달 X. */
  onFeedback?: (kind: "up" | "down", note: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<null | "up" | "down">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "up" | "down">(null);

  async function send(kind: "up" | "down") {
    const t = note.trim();
    if (busy) return;
    if (kind === "down" && !t) return; // 👎는 교정 필수
    setBusy(true);
    let ok = true;
    if (t) ok = (await onFeedback?.(kind, t)) ?? false; // 노트 있으면 서버 반영
    setBusy(false);
    if (ok) {
      setDone(kind);
      setMode(null);
      setNote("");
    }
  }

  return (
    <div className="max-w-[82%] self-start">
      <div className="rounded-2xl rounded-tl-sm bg-lilac-soft/90 text-eye-purple px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
        {content}
        {streaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-eye-purple/60 animate-pulse-soft" />
        )}
      </div>

      {onFeedback && !streaming && (
        <div className="mt-1 pl-1">
          {done ? (
            <span className="text-[12px] text-lilac-soft/70">
              {done === "down" ? "반영했어 🌙 다음부터 그렇게 반응할게" : "고마워 🌙"}
            </span>
          ) : mode ? (
            <div className="flex items-end gap-1.5 mt-1">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                rows={2}
                autoFocus
                placeholder={
                  mode === "down"
                    ? "실제 상대는 어떤 사람이야? (예: 사실 낯을 많이 가려)"
                    : "어떤 점이 걔다웠어? (건너뛰기 OK)"
                }
                className="flex-1 px-3 py-2 rounded-xl bg-night/40 border border-lilac-mid/30 text-cream-warm text-[13px] leading-snug placeholder:text-lilac/50 resize-none scrollbar-hide focus:outline-none focus:border-gold/50"
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void send(mode)}
                  disabled={busy || (mode === "down" && !note.trim())}
                  className="rounded-lg px-2.5 py-1.5 bg-gold text-night-deep text-[12px] font-bold disabled:opacity-40"
                >
                  보내기
                </button>
                <button
                  type="button"
                  onClick={() => (mode === "up" ? setDone("up") : setMode(null))}
                  className="rounded-lg px-2.5 py-1 text-lilac-soft/70 text-[12px]"
                >
                  {mode === "up" ? "건너뛰기" : "취소"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 text-[13px]">
              <button type="button" onClick={() => { setMode("up"); setNote(""); }} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 맞아요">
                👍
              </button>
              <button type="button" onClick={() => { setMode("down"); setNote(""); }} className="text-lilac-soft/70 hover:text-gold-soft" aria-label="이 반응 달라요">
                👎
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(기존 `<SimBubble content streaming />` 호출은 `onFeedback` optional 이라 무해).

- [ ] **Step 3: 커밋**

```bash
git add components/relationship/sim/SimBubble.tsx
git commit -m "feat(sim-fe): 인형 대사 👍/👎 피드백 버튼 + 인라인 교정 입력"
```

---

## Task 5: NightStage 배선 + 무대 미니 안내

**Files:**
- Modify: `components/relationship/sim/NightStage.tsx`

완료된 인형 대사(`SimBubble`)에 `onFeedback`을 전달해 피드백 라우트로 전송한다. 스트리밍 중 `live` 버블에는 전달하지 않는다(버튼 미표시). 프레임 노트 아래 무대 미니 안내(👍 맞아요 · 👎 달라요)를 한 번 얹는다.

- [ ] **Step 1: 피드백 전송 핸들러 추가**

`NightStage.tsx`의 `fetchNote` 함수 정의 바로 다음에 핸들러를 추가:

```ts
  // 인형 대사 피드백(👍/👎) → 상대 성격 즉시 반영. 성공 시 true(SimBubble 이 완료 표시).
  async function sendFeedback(kind: "up" | "down", note: string): Promise<boolean> {
    try {
      const res = await fetch("/api/relationship/sim/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, kind, note }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
```

- [ ] **Step 2: 완료 인형 대사에 onFeedback 전달**

`messages.map` 안에서 인형 대사를 렌더하는 분기를 찾는다:

```tsx
          ) : (
            <SimBubble key={m.id} content={m.text} />
          )
```

다음으로 교체(완료 대사에만 피드백 — live 버블은 아래에서 별도, onFeedback 없음):

```tsx
          ) : (
            <SimBubble key={m.id} content={m.text} onFeedback={sendFeedback} />
          )
```

live 스트리밍 버블(`{live && ... <SimBubble content={live.text} streaming />}`)은 그대로 둔다(onFeedback 없음 → 버튼 미표시).

- [ ] **Step 3: 프레임 노트 아래 무대 미니 안내**

`messages.map` 렌더 블록에서 프레임 노트를 렌더하는 줄을 찾는다:

```tsx
        <ByeolkongNote text={props.frame} kind="frame" />
```

바로 다음 줄에 미니 안내를 추가:

```tsx
        <ByeolkongNote text={props.frame} kind="frame" />
        <p className="self-center text-[11px] text-lilac-soft/50 -mt-1">인형 대사에 👍 맞아요 · 👎 달라요로 알려줄 수 있어</p>
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add components/relationship/sim/NightStage.tsx
git commit -m "feat(sim-fe): 인형 대사 피드백 배선 + 무대 미니 안내"
```

---

## Task 6: E2E 검증 + 마감

**Files:** 없음(검증만)

- [ ] **Step 1: dev 서버에서 전체 흐름 검증**

브라우저 프리뷰로 시뮬 진입 → 인형 대사 1턴 유도 → 대사 하단 👎 → "실제론 낯을 많이 가려" 입력 → 보내기 → "반영했어 🌙" 확인. 다음 유저 발화 후 인형 반응이 교정 방향으로 바뀌는지 관찰(경향 확인, 결정론 아님).

- [ ] **Step 2: personality 실제 갱신 확인**

`scripts/run-prod-query.mjs`는 prod 전용(read_only)이므로 dev 는 QA 하네스/직접 조회로 확인하거나, 마이페이지에서 해당 상대 프로필 성격에 `· 낯을 많이 가려`가 누적됐는지 육안 확인.

- [ ] **Step 3: 👍 스킵 경로 확인**

인형 대사 👍 → 입력 없이 "건너뛰기" → 서버 호출 없이 "고마워 🌙" 로컬 표시되는지(네트워크 탭에 feedback 요청 없음) 확인.

- [ ] **Step 4: 프로필 미등록 상대 방어 확인(선택)**

`partner_profile_id`가 없는 관계에서 피드백 전송 시 409(`NO_PROFILE`)로 실패하고 완료 표시가 뜨지 않는지 확인. (프론트는 실패 시 `done`을 세우지 않음 → 재시도 가능. 실사용선 대부분 프로필 등록됨.)

- [ ] **Step 5: 최종 마감**

`superpowers:finishing-a-development-branch`로 dev 반영(사용자 확인 후 push).

---

## Self-Review 체크

- **Spec 커버리지:** 👍/👎(Task 4) · 교정 입력 필수/선택(Task 4) · personality append(Task 1·2) · 즉시 반영·다음 턴(Task 2 자동) · 전파(personality 원천, 코드 무변경) · 유저 안내(Task 3·5) · 프로필 미등록 방어(Task 2·6) — 전부 커버.
- **타입 일관성:** `appendPersonalityNote(existing: string|null, note: string): string`(Task 1) ↔ Task 2 호출 시그니처 일치. `onFeedback(kind, note) => Promise<boolean>`(Task 4) ↔ `sendFeedback`(Task 5) 일치.
- **MVP 제외 유지:** undo·히스토리·자동 요약·서버측 대사 기록 없음.
