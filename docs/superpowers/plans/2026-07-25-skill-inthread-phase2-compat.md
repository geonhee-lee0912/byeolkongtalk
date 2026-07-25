# 스킬 인-스레드 Phase 2 (우리 궁합) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "우리 사이" 궁합 스킬을 별도 페이지/별도 reading 없이 연애 상담 스레드 안에서 진행 — 확인 모달(40⭐) → 서버가 두 사주로 구조화 리포트 생성 → 같은 스레드에 **접기/펴기 카드**로 렌더 → 일반 대화로 자연 복귀.

**Architecture:** Phase 1 `skillStart`를 compat로 일반화. 단 궁합은 **원샷**이라 판정과 달리 대화모드/`[SKILL_DONE]`/턴캡이 없다 — `skillStart:"compat"`가 40⭐ 차감 + 인-플라이트 락 + `calcSaju`×2 + 기존 compat 프롬프트 `generateOnce` → 구조화 리포트를 스레드 메시지(`skill_key='compat'`, JSON)로 저장 후 **JSON 반환**(스트림 아님). 클라는 로딩 버블 → `tryParseStoredCompatReport`로 감지해 `ThreadCompatCard`(접기/펴기) 렌더. 모델 맥락엔 compat JSON을 짧은 자연어로 치환해 오염 방지.

**Tech Stack:** Next.js 16 (App Router, `runtime="nodejs"`), TypeScript strict, Supabase(service role), Anthropic SDK(`generateOnce` 논스트림 1회 호출 + `cache_control`). 테스트: `node:test` + `tsx`(순수 함수). 라우트/UI 검증: `npx tsc --noEmit` + `next build` + 브라우저 E2E(dev). 마이그레이션 없음(Phase 1 `messages.skill_key` 재사용).

**스펙:** `docs/superpowers/specs/2026-07-25-스킬-스레드내-phase2-궁합.md`

---

## 파일 구조 (생성/수정/삭제)

**생성**
- `lib/relationship/compat-thread.ts` — `redactCompatForModel` 순수 헬퍼(compat JSON 메시지 → 모델 맥락용 자연어 치환)
- `lib/relationship/compat-thread.test.ts` — 위 헬퍼 유닛 테스트
- `components/relationship/ThreadCompatCard.tsx` — 인-스레드 접기/펴기 궁합 카드

**수정**
- `app/api/relationship/chat/route.ts` — `skillStart:"compat"` 분기(두 프로필 검증·40⭐·인-플라이트 락·calcSaju×2·compat 생성·카드 저장·JSON 반환·환불) + 최근창 compat 치환 + `maxDuration=120`
- `components/relationship/ThreadChat.tsx` — compat 메시지 렌더 분기 + `sendSkillStart` kind 분기(compat=JSON) + `compatLoading` + `partnerLabel` prop
- `app/relationship/page.tsx` — `ThreadChat`에 `partnerLabel` 전달
- `lib/relationship/useSkillLaunch.ts` — compat `runLaunch` → `onInThreadSkill("compat")`, `launchCompat` + 고아 상수 제거
- `data/persona/byeolkong_relationship.md` — compat 인-스레드 제안 톤 + 연속성 예고 범위 조정
- `app/api/fortune/create/route.ts` — 관계 태깅 분기(relationshipId·skill_key·compat logSkillToThread) 제거

**유지 (Phase 3에서 제거)**
- 복귀 인사/CTA/recap-seen·`pending_skill_recap`·`applySkillToMemo`·`logSkillToThread` — checkin·deep_feelings(tarot_draw)가 아직 이동형.

---

## Task 1: `redactCompatForModel` 순수 헬퍼 + 테스트 (TDD)

스레드에 저장된 compat 리포트(JSON)가 이후 턴에서 모델 최근창에 그대로 들어가면 노이즈다. `tryParseStoredCompatReport`로 감지해 짧은 자연어로 치환(assistant→assistant, 길이·role 불변 → alternation 유지). skill_log 요약 + 파일 블록이 연속성 이중 보강.

**Files:**
- Create: `lib/relationship/compat-thread.ts`
- Create: `lib/relationship/compat-thread.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/relationship/compat-thread.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCompatForModel } from "./compat-thread.ts";
import { buildCompatReport, serializeCompatReport } from "@/lib/fortune/compat-report";
import type { ThreadMsg } from "./memory.ts";

const sampleReport = serializeCompatReport(
  buildCompatReport({
    grade: "좋은 인연",
    theme: "서로 배우는 사이",
    summary: "두 일간이 만나 만드는 흐름.",
    chemistry: "오행 케미 설명.",
    attraction: "끌림 설명.",
    conflict: "갈등 설명.",
    longterm: "장기 전망 설명.",
    advice: ["실천1", "실천2", "실천3"],
    note: "별콩이 한마디.",
  })
);

test("redactCompatForModel — compat JSON assistant 메시지를 짧은 자연어로 치환", () => {
  const rows: ThreadMsg[] = [
    { role: "user", content: "궁합 어때?" },
    { role: "assistant", content: sampleReport },
  ];
  const out = redactCompatForModel(rows);
  assert.equal(out.length, 2); // 길이 불변(치환, 필터 아님)
  assert.equal(out[0].content, "궁합 어때?"); // user 원문 유지
  assert.equal(out[1].role, "assistant"); // role 불변
  assert.ok(!out[1].content.startsWith("{")); // JSON 아님
  assert.ok(out[1].content.includes("좋은 인연")); // 등급 포함
  assert.ok(out[1].content.includes("서로 배우는 사이")); // 테마 포함
});

test("redactCompatForModel — 일반 메시지는 그대로 통과", () => {
  const rows: ThreadMsg[] = [
    { role: "assistant", content: "그냥 평범한 답장이야." },
    { role: "user", content: "{이건 JSON 아님}" },
  ];
  const out = redactCompatForModel(rows);
  assert.equal(out[0].content, "그냥 평범한 답장이야.");
  assert.equal(out[1].content, "{이건 JSON 아님}");
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --import tsx --test lib/relationship/compat-thread.test.ts`
Expected: FAIL — `redactCompatForModel` is not a function / 모듈 없음

- [ ] **Step 3: 헬퍼 구현**

`lib/relationship/compat-thread.ts`:

```ts
// lib/relationship/compat-thread.ts — 인-스레드 궁합(compat) 리포트의 모델 맥락 치환.
// 스레드에 저장된 compat 카드는 JSON이라, 이후 턴에서 모델 최근창에 넣으면 노이즈 +
// 별콩이가 JSON을 되뇔 위험. 짧은 자연어로 치환해 연속성만 남긴다(skill_log 요약이 이중 보강).
import { tryParseStoredCompatReport } from "@/lib/fortune/compat-report";
import type { ThreadMsg } from "./memory";

/** compat JSON assistant 메시지를 "(별콩이가 우리 궁합을 봤어 — 등급, 테마)"로 치환.
 *  role·길이 불변(치환이지 필터 아님) → Anthropic alternation 유지. 순수 함수. */
export function redactCompatForModel(rows: ThreadMsg[]): ThreadMsg[] {
  return rows.map((m) => {
    if (m.role !== "assistant") return m;
    const report = tryParseStoredCompatReport(m.content);
    if (!report) return m;
    return {
      role: "assistant",
      content: `(별콩이가 우리 궁합을 봤어 — ${report.grade}, ${report.theme})`,
    };
  });
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --import tsx --test lib/relationship/compat-thread.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/relationship/compat-thread.ts lib/relationship/compat-thread.test.ts
git commit -m "feat(relationship): redactCompatForModel — compat JSON 모델 맥락 치환 + 테스트"
```

---

## Task 2: 채팅 라우트 — `skillStart:"compat"` 분기 + 최근창 치환

핵심 태스크. 현 verdict 전용 `skillStart` 블록에 compat 분기를 **앞에 삽입**(verdict 코드는 그대로 둠). compat은 두 프로필 검증 → 40⭐ 차감 → 인-플라이트 락 → calcSaju×2 → 기존 compat 프롬프트 `generateOnce`(+1회 재시도) → 카드 메시지 저장(`skill_key='compat'`) + `appendSkillLog` + 락 해제 → **JSON 반환**. 실패 시 40⭐ 환불 + 락 해제. 두 곳(verdict skillStart·일반 메시지)의 `past`는 `redactCompatForModel`로 감쌈. `maxDuration=120`.

**Files:**
- Modify: `app/api/relationship/chat/route.ts`

- [ ] **Step 1: import 블록 확장**

`app/api/relationship/chat/route.ts`의 import 블록(8–33행)에 다음을 추가한다. `@/lib/claude` 구조분해에 `generateOnce`를 추가하고, 새 import 라인들을 `import { randomUUID } from "node:crypto";`(33행) 앞에 넣는다:

```ts
import {
  buildRelationshipSystemMessage,
  streamChat,
  summarizeOlder,
  computeTurnSignals,
  generateOnce,
  VERDICT_INTHREAD_TURN_CAP,
} from "@/lib/claude";
```

그리고 새 import 라인(구조분해 import들 뒤, `import { randomUUID }` 앞):

```ts
import { calcSaju } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE } from "@/lib/fortune/types";
import {
  parseCompatReportJson,
  buildCompatReport,
  serializeCompatReport,
} from "@/lib/fortune/compat-report";
import { redactCompatForModel } from "@/lib/relationship/compat-thread";
```

- [ ] **Step 2: `maxDuration` 추가**

`export const dynamic = "force-dynamic";`(36행) 바로 뒤에 추가:

```ts
// compat 스킬은 동기 generateOnce(Claude 1회, bounded)를 요청 내에서 처리 → 여유 상향.
export const maxDuration = 120;
```

- [ ] **Step 3: compat skillStart 분기 삽입**

`if (body.skillStart) {`(101행) 바로 다음 줄, `if (body.skillStart !== "verdict") {`(102행) **앞에** compat 분기 전체를 삽입한다:

```ts
    // ── Phase 2: 궁합(compat) — 원샷 구조화 리포트를 스레드 카드로(JSON 반환) ──
    if (body.skillStart === "compat") {
      const skill = getSkill("compat");
      if (!skill) return NextResponse.json({ error: "skill_not_found" }, { status: 500 });

      // 인-플라이트 락 — 중복 차감 방지. compat 락이 3분 초과면 stale 로 override(하드 크래시 복구).
      const STALE_MS = 3 * 60 * 1000;
      if (activeSkill) {
        const started = activeSkill.started_at ? new Date(activeSkill.started_at).getTime() : 0;
        const stale = activeSkill.key === "compat" && Date.now() - started > STALE_MS;
        if (!stale) return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
      }

      // 두 프로필 로드 + 생년월일 검증 (서버 최종 권위)
      if (!rel.partner_profile_id) return NextResponse.json({ error: "partner_birth_required" }, { status: 400 });
      if (!rel.self_profile_id) return NextResponse.json({ error: "self_birth_required" }, { status: 400 });
      const { data: profRows } = await supabase
        .from("user_profiles")
        .select("id, display_name, birth_date, birth_time, is_lunar_input, is_leap_month, gender")
        .in("id", [rel.self_profile_id, rel.partner_profile_id])
        .eq("user_id", userId);
      const selfRow = profRows?.find((r) => r.id === rel.self_profile_id);
      const partnerRow = profRows?.find((r) => r.id === rel.partner_profile_id);
      if (!selfRow?.birth_date || !partnerRow?.birth_date) {
        return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      }

      // 40별 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
      const spend = await spendStars(userId, skill.starCost, {
        readingId: threadReadingId,
        source: "rel_skill_compat",
      });
      if (!spend.success) {
        return NextResponse.json(
          { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: skill.starCost },
          { status: 402 }
        );
      }

      // 인-플라이트 락 세팅
      {
        const lockMemo = (rel.memo ?? {}) as RelationshipMemo;
        lockMemo.active_skill = { key: "compat", started_at: new Date().toISOString(), assistant_turns: 0 };
        await supabase.from("relationships").update({ memo: lockMemo }).eq("id", rel.id);
      }

      const refundAndUnlock = async () => {
        await chargeStars(userId, skill.starCost, `refund_${randomUUID()}`, "rel_skill_compat_refund").catch(() => {});
        const undo = (rel.memo ?? {}) as RelationshipMemo;
        undo.active_skill = null;
        await supabase.from("relationships").update({ memo: undo }).eq("id", rel.id);
      };

      try {
        const saju = calcSaju(profileRowToSajuInput(selfRow));
        const sajuB = calcSaju(profileRowToSajuInput(partnerRow));
        const system = buildFortuneSystem("compat", {
          saju,
          sajuB,
          names: { a: selfRow.display_name, b: partnerRow.display_name },
        });
        const logCtx = { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "compat" } };
        let ai = parseCompatReportJson(
          await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE.compat, logCtx)
        );
        if (!ai) {
          ai = parseCompatReportJson(
            await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE.compat, logCtx)
          );
        }
        if (!ai) throw new Error("compat_parse_failed");

        const report = buildCompatReport(ai);
        const now = new Date().toISOString();
        await supabase.from("messages").insert([
          { reading_id: threadReadingId, role: "assistant", content: serializeCompatReport(report), skill_key: "compat", created_at: now },
        ]);
        const doneMemo = (rel.memo ?? {}) as RelationshipMemo;
        const withLog = appendSkillLog(doneMemo, "compat", threadReadingId, report.summary, now);
        withLog.active_skill = null;
        await supabase.from("relationships").update({ memo: withLog, last_visited_at: now }).eq("id", rel.id);

        return NextResponse.json({ report });
      } catch (err) {
        await refundAndUnlock();
        await logError(err, ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "compat" } }));
        return NextResponse.json({ error: "compat_generation_failed", refunded: true }, { status: 500 });
      }
    }

```

- [ ] **Step 4: verdict skillStart 의 `past`에 치환 적용**

verdict skillStart 분기의 `const past = (pastRows ?? []) as ThreadMsg[];`(129행)을 교체:

```ts
    const past = redactCompatForModel((pastRows ?? []) as ThreadMsg[]);
```

- [ ] **Step 5: 일반 메시지 경로의 `past`에 치환 적용**

일반 메시지 경로의 `const past = (pastRows ?? []) as ThreadMsg[];`(213행)을 교체:

```ts
  const past = redactCompatForModel((pastRows ?? []) as ThreadMsg[]);
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add app/api/relationship/chat/route.ts
git commit -m "feat(relationship): chat 라우트 skillStart:compat 분기 + 최근창 compat 치환"
```

---

## Task 3: `ThreadCompatCard` 컴포넌트 (접기/펴기)

인-스레드 궁합 카드. 접힘=등급 배지 + 테마 + summary 2줄 클램프 + "펼쳐보기". 펼침=오행 케미/끌림·성격/갈등 포인트/장기 전망 + 조언 3 + 별콩이 한마디 + "접기". `CompatReportView`의 연애 variant 라벨을 따르되 **사주판 없이**, 앱 팔레트로.

**Files:**
- Create: `components/relationship/ThreadCompatCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/relationship/ThreadCompatCard.tsx`:

```tsx
"use client";

// 인-스레드 궁합 카드 — 관계 스레드에 별콩이가 건넨 궁합 결과(접기/펴기).
// content=compat 리포트 JSON 인 assistant 메시지에서 ThreadChat 이 렌더한다(별도 페이지 없음).
import { useState } from "react";
import type { CompatReport } from "@/lib/fortune/compat-report";

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream-warm rounded-2xl px-3.5 py-3 border border-lilac-mid/25">
      <h4 className="text-[12.5px] font-bold text-lilac-deep mb-1">{title}</h4>
      <p className="text-[12.5px] text-[#322E3D] leading-[1.75] whitespace-pre-line">{body}</p>
    </div>
  );
}

export default function ThreadCompatCard({
  report,
  partnerLabel,
}: {
  report: CompatReport;
  partnerLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const namesLine = partnerLabel ? `나 ⟡ ${partnerLabel}` : "우리 궁합";

  return (
    <div className="flex justify-start mb-3 pl-10">
      <div className="w-full max-w-[300px] bg-white rounded-2xl border border-lilac-mid/40 shadow-sm px-3.5 pt-3 pb-3.5">
        {/* 헤더 — 등급 배지 + 테마 */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-light mb-2">
          <span aria-hidden>💑</span>
          <span className="font-bold text-eye-purple">{namesLine}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="shrink-0 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-[#7a5a12]">
            {report.grade}
          </span>
          <span className="text-[12.5px] font-bold text-eye-purple leading-snug">{report.theme}</span>
        </div>

        {/* summary — 접힘엔 2줄 클램프 */}
        <p
          className={`text-[12.5px] text-[#322E3D] leading-[1.7] whitespace-pre-line ${
            open ? "" : "line-clamp-2"
          }`}
        >
          {report.summary}
        </p>

        {open && (
          <div className="mt-3 flex flex-col gap-2.5">
            <Section title="🔮 오행 케미" body={report.chemistry} />
            <Section title="💘 끌림·성격 케미" body={report.attraction} />
            <Section title="🌗 갈등 포인트" body={report.conflict} />
            <Section title="🌱 장기 전망" body={report.longterm} />
            <div className="bg-cream-warm rounded-2xl px-3.5 py-3 border border-lilac-mid/25">
              <h4 className="text-[12.5px] font-bold text-lilac-deep mb-1.5">💡 관계를 위한 조언</h4>
              <ol className="flex flex-col gap-1">
                {report.advice.map((a, i) => (
                  <li key={i} className="flex gap-1.5 text-[12.5px] text-[#322E3D] leading-[1.6]">
                    <span className="font-bold text-lilac-deep shrink-0">{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div
              className="rounded-2xl px-3.5 py-3 text-white"
              style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}
            >
              <h4 className="text-[12.5px] font-bold text-gold mb-1">🌙 별콩이의 한마디</h4>
              <p className="text-[12.5px] leading-[1.8] text-white/90 whitespace-pre-line">{report.note}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full mt-3 rounded-xl text-[12px] font-bold py-2.5 active:scale-[0.98] transition ${
            open ? "bg-lilac-soft/60 text-lilac-deep" : "bg-lilac-deep text-white"
          }`}
        >
          {open ? "접기 ▴" : "전체 궁합 펼쳐보기 ▾"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 미사용 컴포넌트 — Task 4에서 마운트)

- [ ] **Step 3: 커밋**

```bash
git add components/relationship/ThreadCompatCard.tsx
git commit -m "feat(relationship): 인-스레드 궁합 카드 ThreadCompatCard(접기/펴기)"
```

---

## Task 4: `ThreadChat` — compat 카드 렌더 + skillStart JSON 분기 + page 배선

compat 메시지를 카드로 렌더 + `sendSkillStart`를 스킬 kind로 분기(compat=JSON) + 로딩 버블 + `partnerLabel` prop. page.tsx가 `partnerLabel`을 전달.

**Files:**
- Modify: `components/relationship/ThreadChat.tsx`
- Modify: `app/relationship/page.tsx`

- [ ] **Step 1: import 추가**

`components/relationship/ThreadChat.tsx` 상단 import에 추가(10–14행 근처, `import { getSkill, buildSkillRecapText }` 아래):

```tsx
import { tryParseStoredCompatReport } from "@/lib/fortune/compat-report";
import ThreadCompatCard from "./ThreadCompatCard";
```

- [ ] **Step 2: props에 `partnerLabel` 추가**

`ThreadChatProps`(67–90행)의 `onSkillDone?` 필드 뒤에 추가:

```tsx
  /** 인-스레드 궁합 카드 헤더용 상대 호칭(관계 label). 없으면 "우리 궁합". */
  partnerLabel?: string | null;
```

- [ ] **Step 3: 구조분해 + `compatLoading` 상태 추가**

컴포넌트 인자 구조분해(92–106행)에 `partnerLabel = null,`을 추가(`onSkillDone,` 뒤). 그리고 `showSkills` 상태 선언(128행) 바로 뒤에 추가:

```tsx
  const [compatLoading, setCompatLoading] = useState(false);
```

- [ ] **Step 4: assistant 메시지 렌더에 compat 카드 분기**

`messages.map` 안, user 분기(400–407행) 다음, `// 완료된 assistant 메시지에 [SKILL:key] 마커...`(408행) **앞에** 삽입:

```tsx
            // compat 리포트 JSON 메시지 → 접기/펴기 궁합 카드로 렌더
            const compat = tryParseStoredCompatReport(msg.content);
            if (compat) {
              return (
                <Fragment key={i}>
                  {dateDivider}
                  <ThreadCompatCard report={compat} partnerLabel={partnerLabel} />
                </Fragment>
              );
            }
```

- [ ] **Step 5: 로딩 버블 렌더 추가**

`(sending || liveText)` 스트리밍 버블 블록(444–452행) 바로 뒤에 compat 로딩 버블을 추가:

```tsx
          {compatLoading && (
            <ChatBubble
              role="assistant"
              content="별콩이가 두 사주로 궁합을 보는 중 ✨"
              showAvatar
              showName
              streaming
            />
          )}
```

- [ ] **Step 6: `sendSkillStart`를 kind로 분기 + `sendCompatSkill` 추가**

`sendSkillStart`(272행) 함수 본문 첫 두 줄을 교체해 compat 을 분기한다. 기존:

```tsx
  const sendSkillStart = async (skillKey: string) => {
    if (sending || activeSkill) return;
    setError(null);
```

교체 후:

```tsx
  const sendSkillStart = async (skillKey: string) => {
    if (sending || activeSkill) return;
    if (getSkill(skillKey)?.kind === "compat") {
      void sendCompatSkill(skillKey);
      return;
    }
    setError(null);
```

그리고 `sendSkillStart` 정의가 끝나는 `};`(322행) 바로 뒤에 `sendCompatSkill`을 추가:

```tsx

  // 인-스레드 궁합 개시 — 원샷 JSON 리포트를 받아 카드 메시지로 삽입(스트림 아님).
  const sendCompatSkill = async (skillKey: string) => {
    setError(null);
    setActiveSkill(skillKey); // 낙관적 락 — 다른 스킬/재진입 차단
    setCompatLoading(true);
    try {
      const res = await fetch("/api/relationship/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, skillStart: skillKey }),
      });
      if (res.status === 402) {
        setCompatLoading(false);
        setActiveSkill(null);
        router.push("/shop");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.report) {
        setCompatLoading(false);
        setActiveSkill(null);
        setError("별콩이가 잠깐 멈칫했어. 다시 시도해줄래?");
        return;
      }
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: JSON.stringify(data.report), createdAt: new Date().toISOString() },
      ]);
      setCompatLoading(false);
      setActiveSkill(null); // 원샷 — 즉시 종료
      onSkillDone?.();
    } catch {
      setCompatLoading(false);
      setActiveSkill(null);
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    }
  };
```

> 주의: `sendCompatSkill`은 `sendSkillStart` 화살표 콜백 안에서 참조되지만 호출 시점 참조라 정의 순서 문제 없음(verdict `sendSkillStart`와 동일 패턴).

- [ ] **Step 7: page.tsx — `partnerLabel` 전달**

`app/relationship/page.tsx`의 S3/S4 `ThreadChat` 마운트(281–295행)에 `partnerLabel` prop을 추가(`partnerProfileId` 아래 줄):

```tsx
          partnerLabel={relationship.label}
```

- [ ] **Step 8: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add components/relationship/ThreadChat.tsx app/relationship/page.tsx
git commit -m "feat(relationship): ThreadChat compat 카드 렌더 + skillStart JSON 분기 + partnerLabel"
```

---

## Task 5: `useSkillLaunch` — compat 인-스레드 개시 (launchCompat 제거)

compat 을 dialogue 와 동일하게 `onInThreadSkill`으로 개시. `launchCompat`(fortune/create fetch + 이동)와 이제 고아가 되는 상수(`PASS_REQUIRED_MSG`·`NETWORK_ERROR_MSG`)를 제거. 확인 모달(40⭐) + 상대 생일 게이트는 `launch()`에 그대로 유지.

**Files:**
- Modify: `lib/relationship/useSkillLaunch.ts`

- [ ] **Step 1: 고아 상수 제거**

`lib/relationship/useSkillLaunch.ts`의 상수 선언(12–15행)을 교체(`launchCompat` 삭제로 `PASS_REQUIRED_MSG`·`NETWORK_ERROR_MSG`가 고아가 됨):

```ts
const PARTNER_BIRTH_MSG = "상대 생년월일을 먼저 등록해줘";
const GENERIC_ERROR_MSG = "지금은 실행할 수 없어. 잠시 후 다시 시도해줄래?";
```

- [ ] **Step 2: `launchCompat` 함수 삭제**

`lib/relationship/useSkillLaunch.ts`의 `launchCompat` 정의 전체(70–107행 — `const launchCompat = async (skill: RelationshipSkill) => { ... };`)를 삭제.

- [ ] **Step 3: `runLaunch`의 compat 분기를 인-스레드로 병합**

`runLaunch`(124–136행)를 교체(compat+dialogue 모두 인-스레드 개시):

```ts
  const runLaunch = (skill: RelationshipSkill) => {
    if (inFlightRef.current || busyKey) return;
    if (skill.kind === "compat" || skill.kind === "dialogue") {
      // 인-스레드 개시 — 별도 페이지/차감 없음. 차감은 chat 라우트(skillStart)가 담당.
      onInThreadSkill?.(skill.key);
      cancelConfirm();
    }
  };
```

- [ ] **Step 4: `confirmLaunch` 주석 정리**

`confirmLaunch`(158–164행)의 compat 관련 주석(2줄)을 교체 — compat 도 이제 인-스레드라 라우팅 없음:

```ts
  const confirmLaunch = () => {
    const skill = pendingSkill;
    if (!skill) return;
    // compat/dialogue 모두 인-스레드 — 즉시 모달 닫고 ThreadChat 이 skillStart 로 스레드에서 개시(라우팅 없음).
    runLaunch(skill);
  };
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`selfProfileId`·`busyKey`·`inFlightRef`는 tarot/parity 로 남되 writer 가 없어짐 — strict 모드는 미사용 setter 를 막지 않고 ESLint 미사용이라 빌드 영향 없음. `router` 는 launchTarotDraw·`/shop` push 로 계속 사용.)

- [ ] **Step 6: 커밋**

```bash
git add lib/relationship/useSkillLaunch.ts
git commit -m "feat(relationship): useSkillLaunch compat 인-스레드 개시(launchCompat 제거)"
```

---

## Task 6: 연애 페르소나 — compat 인-스레드 제안 톤

기존 §스킬 제안의 "연속성 예고 (필수)"(이동형 예고)는 compat·verdict 처럼 인-스레드 스킬엔 안 맞다. verdict 에 이어 compat 도 인-스레드 예외로 명시하고, 연속성 예고를 남은 이동형 스킬(checkin·deep_feelings)에만 걸리게 범위 조정.

**Files:**
- Modify: `data/persona/byeolkong_relationship.md`

- [ ] **Step 1: 연속성 예고 불릿의 범위 한정**

`data/persona/byeolkong_relationship.md`의 "연속성 예고 (필수)" 불릿(74행)을 교체 — 대상을 이동형 스킬로 한정:

```markdown
- **연속성 예고 (이동형 스킬: `checkin`·`deep_feelings`)**: 이 두 스킬은 카드 뽑는 별도 화면으로 갔다 와. 마커 직전 문장에 "갔다 오면 그 결과 갖고 여기서 바로 이어서 보자"는 **약속**을 담아 — 결과를 보고 스레드로 돌아오면 별콩이가 그걸 짚으며 대화를 잇는다는 걸 미리 알려. 단, 위 '탈출구·유도 문구 금지'와 충돌하지 않게: "안 봐도 돼 / 부담 없이"가 아니라 **이어짐을 확신시키는 톤**이어야 해. 예) "그 얘긴 관계 체크인으로 더 자세히 볼 수 있어. 보고 오면 그거 갖고 여기서 이어서 얘기하자."
```

- [ ] **Step 2: compat 인-스레드 예외 불릿 추가**

`verdict`(싸움 판정) 인-스레드 예외 불릿(75행) **바로 뒤**에 compat 예외 불릿을 삽입:

```markdown
- **`compat`(우리 궁합)도 예외 — 인-스레드**: 궁합은 다른 화면으로 가지 않고 **바로 이 대화 안에서** 별콩이가 둘 사주로 봐서 결과 카드를 건네줘. 그러니 compat 을 제안할 땐 "갔다 와서 이어서"가 아니라 "지금 여기서 바로 봐줄게" 톤으로. 예) "그럼 지금 여기서 너랑 {호칭} 둘 사주로 궁합 바로 봐줄게 — 결과 보고 같이 얘기하자."
```

- [ ] **Step 3: 커밋**

```bash
git add data/persona/byeolkong_relationship.md
git commit -m "feat(relationship): 페르소나 — compat 인-스레드 제안 톤 + 연속성 예고 범위 조정"
```

---

## Task 7: `/api/fortune/create` — 관계 태깅 분기 제거

궁합이 인-스레드로 오면서 관계 스킬은 더는 `/api/fortune/create`를 호출하지 않는다. 거기 붙어 있던 `relationshipId` 검증·`skill_key='compat'`·compat `logSkillToThread`가 dead 가 된다. `/fortune` 독립 궁합·`compat_social`은 `relationshipId`를 넘기지 않으므로 무손상.

**Files:**
- Modify: `app/api/fortune/create/route.ts`

- [ ] **Step 1: `relationshipId`가 관계 스킬 외 경로에서 안 쓰이는지 확인**

Run: `grep -rn "relationshipId" app/ components/ lib/ | grep -i fortune`
Expected: `useSkillLaunch.ts`의 `launchCompat`(Task 5에서 이미 삭제됨) 외에 `/api/fortune/create`로 `relationshipId`를 보내는 호출부가 **없음**. (`/fortune/compat` 입력 폼 `CompatInput.tsx`는 relationshipId 미전송임을 확인.)

- [ ] **Step 2: relationshipId 선언·검증 블록 제거**

`app/api/fortune/create/route.ts`에서 다음을 삭제한다:

(a) `let relationshipId: string | null = null;`(232행)과 그 위 주석(231행 `// "우리 사이" 스킬(compat) 태깅 ...`).

(b) compat 분기 안의 relationshipId 검증 블록(256–270행) 전체:

```ts
    // "우리 사이" 스킬(compat) 태깅 — relationshipId 있을 때만 검증(anti-forgery). compat_social 은 미대상.
    if (cfg.type === "compat" && typeof body.relationshipId === "string" && body.relationshipId) {
      const { data: relRow } = await supabase
        .from("relationships")
        .select("id, user_id")
        .eq("id", body.relationshipId)
        .maybeSingle();
      if (!relRow || relRow.user_id !== userId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (!(await getActivePass(body.relationshipId))) {
        return NextResponse.json({ error: "pass_required" }, { status: 402 });
      }
      relationshipId = body.relationshipId;
    }
```

- [ ] **Step 3: reading insert 의 relationship 컬럼 제거**

reading insert(381–397행)의 두 줄을 삭제:

```ts
      relationship_id: relationshipId,
      skill_key: relationshipId ? "compat" : null,
```

- [ ] **Step 4: compat 완료 후 logSkillToThread 블록 제거**

compat 파싱 성공 분기(511–519행)의 `logSkillToThread` 블록을 삭제:

```ts

      // "우리 사이" 스킬(compat) 결과 — 관계 스레드 memo.skill_log 에 요약 적립(별콩이 기억용).
      // fire-and-forget + 자체 가드 — 실패해도 리포트 저장에는 영향 없음.
      if (relationshipId) {
        void logSkillToThread(relationshipId, "compat", readingId, ai.summary).catch((e) => {
          console.warn("[relationship] compat skill-log 실패 (무시):", e instanceof Error ? e.message : e);
        });
      }
```

(`storedContent = serializeCompatReport(buildCompatReport(ai));`는 남긴다.)

- [ ] **Step 5: 고아 import 제거**

위 삭제로 `getActivePass`·`logSkillToThread` import 가 고아가 된다(다른 곳에서 안 쓰임 확인). `app/api/fortune/create/route.ts`의 import(42–43행) 삭제:

```ts
import { getActivePass } from "@/lib/relationship/passes";
import { logSkillToThread } from "@/lib/relationship/skill-log";
```

또한 body 타입의 `relationshipId?: unknown;`(161행) 필드도 삭제(더는 안 읽음).

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`getActivePass`·`logSkillToThread`·`relationshipId`가 완전히 사라져 미사용 import/변수 없음.)

- [ ] **Step 7: 커밋**

```bash
git add app/api/fortune/create/route.ts
git commit -m "refactor(fortune): create 라우트의 관계 compat 태깅 분기 제거(인-스레드로 이관)"
```

---

## Task 8: 통합 검증 (tsc · 유닛 · 빌드 · E2E)

**Files:** (검증만 — 코드 변경 없음)

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 관계 유닛 테스트 전체**

Run: `node --import tsx --test lib/relationship/compat-thread.test.ts lib/relationship/memory.test.ts`
Expected: PASS (compat-thread 2 + memory 기존 전부)

- [ ] **Step 3: 프로덕션 빌드**

Run: `npx next build`
Expected: 빌드 성공 (타입/컴파일 에러 없음)

- [ ] **Step 4: 브라우저 E2E (dev) — 골든 패스**

> ⚠️ 페르소나(`byeolkong_relationship.md`) 수정 후엔 dev 서버 **재시작** 필수(모듈 캐시). — [[qa-harness-usage]]

`.claude/launch.json`의 dev 서버로 preview 열고, 카카오 로그인 + 활성 패스 + 상대 생일 등록된 관계로:
1. 스킬 시트/칩에서 "우리 궁합" → StarConfirmModal(40⭐) → 확인.
2. 로딩 버블("별콩이가 두 사주로 궁합을 보는 중 ✨") → 접힌 카드(등급 배지 + 테마 + 요약 2줄) 노출.
3. "전체 궁합 펼쳐보기" → 오행/끌림/갈등/장기 + 조언 3 + 별콩이 한마디 인라인 확장 → "접기".
4. 카드 아래에서 일반 메시지 1개 전송 → 별콩이가 궁합을 자연스럽게 이어 언급(JSON 을 되뇌지 않음).
5. 새로고침 → 카드가 접힌 상태로 스레드에 그대로 영속.
Expected: 각 단계 정상. `read_console_messages`/`preview_logs` 에러 없음. `/api/stars/balance` 40 차감 확인.

- [ ] **Step 5: 브라우저 E2E (dev) — 엣지**

1. 상대 생일 미등록 관계에서 궁합 칩 → 확인 전 안내("상대 생년월일을 먼저 등록해줘") 또는 확인 후 400 처리(에러 토스트).
2. 잔액 < 40 → 확인 시 `/shop` 이동.
Expected: 이중 차감 없음, 스레드 오염 없음.

- [ ] **Step 6: (선택) QA 하네스 — compat 제안 톤 스팟체크**

compat 생성 프롬프트는 불변이라 리포트 품질은 회귀 낮음. 페르소나 제안 톤만 얇게 확인 — 유저가 "쟤랑 잘 맞을까?" 류를 꺼내면 별콩이가 "지금 여기서 바로 봐줄게" 톤으로 `[SKILL:compat]`을 제안하는지 1~2케이스 육안 확인.

- [ ] **Step 7: 최종 상태 확인**

Run: `git status` / `git log --oneline -8`
Expected: 작업 트리 clean, Task 1–7 커밋 7개 존재.

---

## Self-Review 결과 (작성자 체크)

- **스펙 커버리지**: 데이터(마이그레이션 없음·카드 저장·appendSkillLog)=T2 · 개시/차감/락=T2 · 모델 맥락 치환=T1+T2 · 카드 렌더=T3+T4 · launcher=T5 · 페르소나=T6 · fortune/create 정리=T7 · 테스트/E2E=T1,T8. 스펙 전 섹션 매핑됨.
- **플레이스홀더**: 없음(모든 코드 스텝에 실제 코드).
- **타입 일관성**: `redactCompatForModel`(T1)↔사용(T2), `ThreadCompatCard` props `report`/`partnerLabel`(T3)↔마운트(T4), `sendCompatSkill`/`compatLoading`/`partnerLabel`(T4) 일치, `getSkill("compat").kind==="compat"`(T4·T5) 일치, `serializeCompatReport`/`tryParseStoredCompatReport`(T2 저장 ↔ T1·T4 파싱) 왕복 일치(`v:1`).
