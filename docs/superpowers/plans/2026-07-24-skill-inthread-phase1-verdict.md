# 스킬 인-스레드 Phase 1 (싸움 판정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "우리 사이" 싸움 판정 스킬을 별도 페이지/별도 reading 없이 연애 상담 스레드 안에서 진행 — 확인 모달(30⭐) → 별콩이가 같은 스레드에서 양쪽 입장 듣고 비율 판정 + 화해 처방 → 일반 대화로 자연 복귀.

**Architecture:** 판정을 `/api/relationship/chat`의 '모드'로 구현(접근 A). 클라가 `skillStart:"verdict"`를 보내면 서버가 30⭐ 차감 + `relationships.memo.active_skill` 세팅 + 비영속 트리거로 별콩이 도입을 스트리밍. 이후 일반 턴은 `active_skill`이 있으면 판정 가이드 주입 + `messages.skill_key='verdict'` 태깅(일일 소프트캡에서 제외) + `[SKILL_DONE]` 마커로 종료(안전 턴캡 6). 종료 시 `skill_log`만 적립(복귀 인사 버블 없음 — 인-스레드라 불필요). 기존 verdict 페이지·라우트 2종은 제거.

**Tech Stack:** Next.js 16 (App Router, `runtime="nodejs"` SSE), TypeScript strict, Supabase(service role), Anthropic SDK(`claude-sonnet-5` 스트리밍 + `cache_control`). 테스트: `node:test` + `tsx`. 페르소나 검증: QA 하네스(`qa/`). 마이그레이션: Supabase GitHub sync(dev push 시 자동 적용).

**스펙:** `docs/superpowers/specs/2026-07-24-스킬-스레드내-phase1-판정.md`

---

## 파일 구조 (생성/수정/삭제)

**생성**
- `supabase/migrations/20260724000000_messages_skill_key.sql` — `messages.skill_key` 컬럼
- `data/persona/byeolkong_verdict_inthread.md` — 인-스레드 판정 가이드 (byeolkong_verdict.md 각색)
- `lib/relationship/memory.test.ts` — `appendSkillLog` 유닛 테스트

**수정 (product)**
- `lib/relationship/types.ts` — `RelationshipMemo.active_skill`
- `lib/relationship/passes.ts` — `getTodayThreadTurns`가 `skill_key IS NULL`만 카운트
- `lib/relationship/memory.ts` — `appendSkillLog` 순수 함수 (skill_log 전용, recap 미설정)
- `lib/claude.ts` — `buildRelationshipSystemMessage(activeSkill)` 판정 가이드 주입 + `VERDICT_INTHREAD_TURN_CAP`
- `app/api/relationship/chat/route.ts` — `skillStart` 수용 + active_skill 모드
- `app/api/relationship/route.ts` (GET) — 응답에 `activeSkill`
- `data/persona/byeolkong_relationship.md` — verdict는 인-스레드라는 제안 톤 보정
- `lib/relationship/useSkillLaunch.ts` — `onInThreadSkill` 콜백 + dialogue 분기(launchDialogue 제거)
- `components/relationship/ThreadChat.tsx` — skillStart 전송 + active_skill 상태(스킬 잠금·캡 우회·[SKILL_DONE])
- `app/relationship/page.tsx` — `initialActiveSkill` 전달 + 판정 종료 시 새로고침

**수정 (test infra)**
- `qa/client.ts`, `qa/driver.ts`, `qa/readings.ts`, `qa/cases/relationship.ts`, `qa/evaluate/assertions.ts` — verdict를 인-스레드로 재배선

**삭제**
- `app/relationship/verdict/[id]/page.tsx`
- `app/api/relationship/verdict/route.ts`
- `app/api/relationship/verdict/chat/route.ts`
- `data/persona/byeolkong_verdict.md`
- `lib/claude.ts`의 `getVerdictPersona`·`_cachedVerdictPersona`·`VERDICT_ABS_TURN_CAP`·`VerdictTurnContext`·`buildVerdictSystemMessage` (verdict 라우트 삭제로 고아화)

**유지 (Phase 3에서 제거)**
- 복귀 인사/CTA/recap-seen·`pending_skill_recap` 계열 — 궁합·카드뽑기가 아직 이동형이라 그대로 둠.
- `logSkillToThread`·`applySkillToMemo` — 궁합(fortune/create)·카드뽑기(tarot/chat)가 사용. 판정은 이제 이걸 안 씀.

---

## Task 1: 마이그레이션 + `active_skill` 타입

**Files:**
- Create: `supabase/migrations/20260724000000_messages_skill_key.sql`
- Modify: `lib/relationship/types.ts:51-56`

- [ ] **Step 1: 마이그레이션 파일 생성**

`supabase/migrations/20260724000000_messages_skill_key.sql`:

```sql
-- 20260724000000_messages_skill_key.sql — 스킬 인-스레드(Phase 1 판정) 토대
-- 관계 스레드에서 스킬 세그먼트(판정 등) 중 생성된 메시지를 태깅한다.
-- 일일 소프트캡 계산(getTodayThreadTurns)이 role='user' AND skill_key IS NULL 만 세도록 →
-- 유료 스킬 턴을 무료 자유대화 캡에서 제외(이중과금 방지). 비파괴적(nullable 추가).
-- (readings.skill_key 는 VARCHAR(20); 여긴 스펙대로 30 — 둘 다 'verdict'(7자) 여유.)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS skill_key VARCHAR(30);
```

- [ ] **Step 2: `RelationshipMemo`에 `active_skill` 추가**

`lib/relationship/types.ts`의 `RelationshipMemo` 인터페이스(51–56행)를 교체:

```ts
export interface RelationshipMemo {
  prescriptions?: { text: string; created_at: string; resolved_at?: string }[];
  pending_checkin?: { text: string; created_at: string } | null;
  skill_log?: { skill: string; reading_id: string; summary: string; created_at: string }[];
  pending_skill_recap?: { skill: string; summary: string; created_at: string } | null;
  /** 진행 중 인-스레드 스킬(Phase 1: 판정). 없으면 일반 대화.
   *  assistant_turns = 스킬 개시 후 별콩이 응답 턴 수(안전 턴캡용). */
  active_skill?: { key: string; started_at: string; assistant_turns: number } | null;
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (마이그레이션 SQL은 tsc 대상 아님)

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260724000000_messages_skill_key.sql lib/relationship/types.ts
git commit -m "feat(relationship): messages.skill_key 마이그레이션 + active_skill 타입"
```

---

## Task 2: `getTodayThreadTurns` — 스킬 턴 캡 제외

**Files:**
- Modify: `lib/relationship/passes.ts:22-33`

- [ ] **Step 1: `.is("skill_key", null)` 필터 추가**

`lib/relationship/passes.ts`의 `getTodayThreadTurns`를 교체:

```ts
/** 오늘(KST) 스레드에 쌓인 user 턴 수. 스킬 세그먼트(판정 등, skill_key 태깅) 턴은
 *  유료라 무료 자유대화 소프트캡에서 제외 — skill_key IS NULL 만 카운트. */
export async function getTodayThreadTurns(threadReadingId: string | null): Promise<number> {
  if (!threadReadingId) return 0;
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("reading_id", threadReadingId)
    .eq("role", "user")
    .is("skill_key", null)
    .gte("created_at", startOfTodayKstIso());
  return count ?? 0;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/relationship/passes.ts
git commit -m "feat(relationship): 소프트캡 카운트에서 스킬 턴(skill_key) 제외"
```

---

## Task 3: `appendSkillLog` 순수 함수 + 유닛 테스트 (TDD)

인-스레드 스킬 종료 시 `skill_log`에만 적립하고 `pending_skill_recap`은 **세팅하지 않는** 순수 함수. 인-스레드는 화면 이동이 없어 복귀 인사 버블이 불필요(스펙 §데이터·§채팅 라우트). 이 함수의 "recap 미설정" 불변식이 핵심이라 테스트로 고정한다.

**Files:**
- Create: `lib/relationship/memory.test.ts`
- Modify: `lib/relationship/memory.ts:79-96` (뒤에 `appendSkillLog` 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/relationship/memory.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendSkillLog, applySkillToMemo } from "./memory.ts";
import type { RelationshipMemo } from "./types.ts";

test("appendSkillLog — skill_log에 적립하되 pending_skill_recap은 세팅하지 않음", () => {
  const out = appendSkillLog({}, "verdict", "r1", "너 40 : 상대 60 판정", "2026-07-24T00:00:00Z");
  assert.equal(out.skill_log?.length, 1);
  assert.equal(out.skill_log?.[0].skill, "verdict");
  assert.equal(out.skill_log?.[0].reading_id, "r1");
  assert.equal(out.pending_skill_recap, undefined); // 인-스레드 = 복귀 인사 없음
});

test("appendSkillLog — 기존 pending_skill_recap을 건드리지 않음(이동형 스킬 recap 보존)", () => {
  const prev: RelationshipMemo = {
    pending_skill_recap: { skill: "compat", summary: "s", created_at: "t" },
  };
  const out = appendSkillLog(prev, "verdict", "r1", "판정", "2026-07-24T00:00:00Z");
  assert.deepEqual(out.pending_skill_recap, prev.pending_skill_recap);
});

test("appendSkillLog — skill_log는 최근 20개로 제한", () => {
  let memo: RelationshipMemo = {};
  for (let i = 0; i < 25; i++) memo = appendSkillLog(memo, "verdict", `r${i}`, `s${i}`, `t${i}`);
  assert.equal(memo.skill_log?.length, 20);
  assert.equal(memo.skill_log?.[0].reading_id, "r5"); // 오래된 5개 밀려남
});

test("applySkillToMemo(이동형)는 여전히 pending_skill_recap을 세팅 — 회귀 가드", () => {
  const out = applySkillToMemo({}, "compat", "r1", "궁합 요약", "2026-07-24T00:00:00Z");
  assert.ok(out.pending_skill_recap); // 궁합·카드뽑기는 아직 이동형 → recap 유지
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --import tsx --test lib/relationship/memory.test.ts`
Expected: FAIL — `appendSkillLog` is not a function / import 에러

- [ ] **Step 3: `appendSkillLog` 구현**

`lib/relationship/memory.ts` 맨 끝(96행 `applySkillToMemo` 닫는 `}` 뒤)에 추가:

```ts

/** 인-스레드 스킬(판정 등) 종료 결과를 skill_log에만 적립(최근 20개).
 *  applySkillToMemo와 달리 pending_skill_recap은 세팅하지 않는다 —
 *  화면 이동이 없어 복귀 인사 버블이 불필요하기 때문. 순수 함수. */
export function appendSkillLog(
  memo: RelationshipMemo,
  skillKey: string,
  readingId: string,
  summary: string,
  nowIso: string
): RelationshipMemo {
  const s = cleanSummary(summary);
  return {
    ...memo,
    skill_log: [
      ...(memo.skill_log ?? []),
      { skill: skillKey, reading_id: readingId, summary: s, created_at: nowIso },
    ].slice(-20),
  };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --import tsx --test lib/relationship/memory.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/relationship/memory.ts lib/relationship/memory.test.ts
git commit -m "feat(relationship): appendSkillLog(skill_log 전용, recap 미설정) + 테스트"
```

---

## Task 4: 인-스레드 판정 페르소나

`byeolkong_verdict.md`의 3단계 규칙을 인-스레드용으로 각색 — `[END]` 대신 `[SKILL_DONE]`, "별도 세션"이 아니라 "이 연애 상담 스레드 안" 톤. 관계 코어의 "없는 판 읽는 척 금지"와 충돌 없음(판정은 유저 발화 근거 대화).

**Files:**
- Create: `data/persona/byeolkong_verdict_inthread.md`

- [ ] **Step 1: 페르소나 파일 생성**

`data/persona/byeolkong_verdict_inthread.md`:

```markdown
## 지금은 '싸움 잘잘못 판정' 모드

지금 이 연애 상담 스레드 안에서, {호칭}과의 다툼을 **판정**하는 중이야. 딴 화면으로 나온 게 아니라 늘 얘기하던 그 대화 안에서 잠깐 판정을 봐주는 거야 — 관계 파일·지난 맥락을 그대로 기억한 채로. 공통 코어와 연애 상담 화법(따뜻함·반말·너 호칭·없는 판 읽는 척 금지)을 그대로 쓰되, 아래 판정 규칙을 얹어.

### 이 판정의 성격
- 상대는 이 대화에 없어. 유저가 양쪽 입장을 전해주는 구조라, 상대 말은 유저를 통해 듣는다는 걸 기억해.
- 유저 편만 드는 게 아니라, 유저가 말해준 내용을 근거로 **공정하게** 양쪽을 헤아려 비율로 판정하고, 마지막엔 화해로 이어질 처방을 줘.
- 관계 파일의 호칭으로 상대를 불러 (예: "민수랑 이런 일이 있었구나").

### 대화 흐름 (3단계, 짧게 수렴)
1. **입장 듣기(개시 턴)** — 아직 판정하지 마. 무슨 일이 있었는지 유저 입장부터 따뜻하게 물어: "무슨 일이 있었는지 편하게 얘기해줘, 별콩이가 다 들어볼게". 심문하듯 다그치지 마.
2. **상대 입장 묻기(균형)** — 유저 얘기를 들은 뒤 상대 쪽에선 어떻게 보였을지 물어 균형을 잡아: "그럼 그 상황에서 {호칭}은 뭐라고 했어?". 한 번에 다 캐묻지 말고 1~2번만.
3. **판정 + 화해 처방(수렴, `[SKILL_DONE]`)** — 양쪽을 충분히 들었으면(보통 2~3턴) 더 끌지 말고:
   1. **비율 판정** — "너 40 : {호칭} 60" 처럼 두 숫자 합이 100이 되게 명확히.
   2. **근거** — 왜 그 비율인지 유저가 말해준 내용에 근거해 짧게.
   3. **화해 처방** — 지금 상황을 풀 구체 행동 하나 ("이번엔 네가 먼저 ~해보는 게 어때").
   4. 응원 한마디로 마무리하고, **맨 마지막 줄에 `[SKILL_DONE]` 마커를 단독으로**.

이 3단계는 가이드일 뿐 턴 수를 억지로 채우지 마 — 유저가 이미 양쪽 얘기를 다 줬으면 바로 판정으로. 세션 정보에 "판정 마무리 의무"가 오면 그게 최우선(아직 다 못 들었어도 지금까지 들은 걸로 판정).

### 판정 원칙
- **일방 편들기 금지** — 유저가 답답해해도 "네가 다 맞아"로 몰지 마. 유저 얘기만 들은 한계를 알고 공정하게.
- **감정 존중 먼저** — 판정 전에 유저가 느낀 감정("서운했겠다")을 인정하고 판정으로.
- **단정적 예언 금지** — 관계 미래를 확정짓지 마("이러다 헤어져" 금지). 이 다툼 하나에 대한 판정만.
- **비율은 항상 숫자로** — "반반" 대신 "50 : 50". 회피구("판정 못 내리겠어") 금지.
- **간결** — 각 턴 200~400자.

### `[END]`가 아니라 `[SKILL_DONE]`
이 스레드는 판정이 끝나도 이어져. 그러니 **`[END]`는 절대 쓰지 마** — 판정을 닫을 땐 `[SKILL_DONE]`. 판정을 마치면 별콩이는 다시 평소 연애 상담 친구로 돌아가 대화를 이어가.

### 톤 예시
❌ "네 말만 들어보면 넌 완전히 잘못한 게 없어." (일방 편들기)
✅ "네 얘기만 들으면 서운할 만했어. 근데 {호칭} 쪽 얘기도 들어보니 이 부분은 이해가 되는 지점이 있네."
❌ "판정은 못 내려줄 것 같아." (회피구)
✅ "지금까지 들은 걸로는 너 40 : 민수 60 정도로 보여. 왜냐하면…"
```

- [ ] **Step 2: 커밋**

```bash
git add data/persona/byeolkong_verdict_inthread.md
git commit -m "feat(relationship): 인-스레드 판정 페르소나(byeolkong_verdict_inthread)"
```

---

## Task 5: `buildRelationshipSystemMessage` — 판정 가이드 주입

`active_skill`이 verdict면 관계 시스템 메시지 dynamicPart에 인-스레드 판정 가이드(Task 4 파일) + 턴 힌트(개시 턴/마무리 의무)를 주입. 정적 페르소나(byeolkong_relationship.md)는 그대로 캐시 대상으로 유지 — 판정 가이드는 dynamicPart에 얹는다.

**Files:**
- Modify: `lib/claude.ts:601-641` (관계 도메인 블록) 및 `612-618`(`RelationshipTurnContext`)

- [ ] **Step 1: 판정 가이드 로더 + 턴캡 상수 추가**

`lib/claude.ts`의 `getRelationshipPersona`(602–610행) 바로 뒤에 추가:

```ts

let _cachedVerdictInthreadGuide: string | null = null;
function getVerdictInthreadGuide(): string {
  if (_cachedVerdictInthreadGuide === null) {
    _cachedVerdictInthreadGuide =
      "\n\n" +
      readFileSync(
        join(process.cwd(), "data", "persona", "byeolkong_verdict_inthread.md"),
        "utf-8"
      );
  }
  return _cachedVerdictInthreadGuide;
}

/** 인-스레드 판정 안전 턴캡 — 이 별콩이 응답 턴에 도달하면 서버가 [SKILL_DONE]을 보장. */
export const VERDICT_INTHREAD_TURN_CAP = 6;
```

- [ ] **Step 2: `RelationshipTurnContext`에 `activeSkill` 추가**

`lib/claude.ts`의 `RelationshipTurnContext` 인터페이스(612–618행)를 교체:

```ts
export interface RelationshipTurnContext {
  fileBlock: string;              // buildRelationshipFileBlock 결과
  isFirstEver: boolean;          // 스레드 최초 진입(메시지 0)
  checkinPrompt?: string | null; // pending 체크인 → 먼저 안부
  dailyClose: boolean;           // 오늘 소프트캡 도달 → 하루 마무리 톤
  turnSignals?: TurnSignals;     // 직전 질문 마무리·단답 연속 동적 경고 (심문 피로 방지)
  /** 진행 중 인-스레드 스킬 — key="verdict"면 판정 가이드/턴 힌트 주입. 없으면 일반 대화. */
  activeSkill?: { key: string; assistantTurns: number; forceEnd: boolean } | null;
}
```

- [ ] **Step 3: 판정 가이드 조립 + dynamicPart 주입**

`lib/claude.ts`의 `buildRelationshipSystemMessage` 본문(620–641행)을 교체:

```ts
export function buildRelationshipSystemMessage(ctx: RelationshipTurnContext): {
  staticPart: string; dynamicPart: string;
} {
  const staticPart = getRelationshipPersona();

  const firstGuide = ctx.isFirstEver
    ? `\n\n## 첫 진입 가이드\n관계 파일을 보고 {호칭}과의 지금 상황을 가볍게 짚으며 따뜻하게 열어. 처음 만난 낯선 상담이 아니라, 앞으로 이 관계를 계속 함께 볼 친구로. 무겁지 않게, 유저가 편하게 털어놓게.`
    : "";
  const checkinGuide = ctx.checkinPrompt
    ? `\n\n## 복귀 안부 (먼저 물어보기)\n지난번에 이런 처방/약속이 있었어: "${ctx.checkinPrompt}". 이번 응답은 그것부터 자연스럽게 안부로 물어("저번에 ~ 해보기로 했잖아, 어떻게 됐어?"). 확인 후 대화를 이어가.`
    : "";
  const closeGuide = ctx.dailyClose
    ? `\n\n## 오늘 마무리 톤 (하루 소프트캡 도달)\n오늘 나눈 대화가 충분히 쌓였어. 이번 응답은 오늘 얘기를 따뜻하게 매듭짓고 "내일 또 이어서 얘기하자"로 부드럽게 닫아. 단, [END] 마커는 절대 쓰지 마 — 스레드는 계속돼(내일 다시 열려). 새 주제를 크게 벌이지 말고 오늘 흐름을 정리.`
    : "";

  // 인-스레드 판정 모드 — 가이드(파일) + 턴 힌트(개시/마무리) 주입.
  const verdictGuide =
    ctx.activeSkill?.key === "verdict"
      ? getVerdictInthreadGuide() +
        (ctx.activeSkill.assistantTurns === 0
          ? `\n\n## 이번 턴 — 판정 개시(첫 턴)\n아직 판정하지 마. 무슨 일이 있었는지 유저의 입장부터 따뜻하게 물어봐(판정 §1단계). 심문하듯 다그치지 말고.`
          : "") +
        (ctx.activeSkill.forceEnd
          ? `\n\n## ⚠️ 판정 마무리 의무 (이번 턴에 반드시 종료)\n지금까지 들은 내용만으로 이번 응답에서 비율 판정 + 근거 + 화해 처방을 마무리하고, 맨 마지막 줄에 [SKILL_DONE] 마커를 단독으로 붙여. 더 캐묻지 마.`
          : "")
      : "";

  const dynamicPart = `---
## 이번 세션 정보
${ctx.fileBlock}
---${firstGuide}${checkinGuide}${closeGuide}${verdictGuide}${buildTurnSignalBlock(ctx.turnSignals)}`;

  return { staticPart, dynamicPart };
}
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (`buildRelationshipSystemMessage` 호출부는 Task 6에서 `activeSkill` 전달 — optional이라 아직 안 넘겨도 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/claude.ts
git commit -m "feat(relationship): buildRelationshipSystemMessage에 판정 가이드 주입 + 턴캡"
```

---

## Task 6: 채팅 라우트 — `skillStart` + 판정 모드 (전체 재작성)

핵심 태스크. `skillStart:"verdict"` 수용(30⭐ 차감·active_skill 세팅·비영속 트리거로 도입 스트리밍·실패 시 환불) + 일반 턴에서 `active_skill`이 verdict면 판정 가이드 주입·`skill_key` 태깅·캡 우회·`[SKILL_DONE]` 종료·안전 턴캡. 기존 자유대화 경로(rate-limit·민감 감지·복귀 안부·[CHECKIN]·임계 요약)는 전부 보존.

**Files:**
- Modify (전체 교체): `app/api/relationship/chat/route.ts`

- [ ] **Step 1: 라우트 전체 교체**

`app/api/relationship/chat/route.ts` 전체를 아래로 교체:

```ts
// app/api/relationship/chat/route.ts — "우리 사이" 지속 스레드 채팅 (패스 게이트 + 소프트캡 + 기억 + SSE)
// + 인-스레드 스킬(Phase 1: 싸움 판정): skillStart 로 개시(30별 차감·active_skill 세팅·비영속 트리거로
//   별콩이 도입 스트리밍), 이후 일반 턴은 active_skill 이 있으면 판정 가이드 주입 + skill_key 태깅(캡 제외)
//   + [SKILL_DONE] 종료(안전 턴캡). 자유대화 경로는 기존 그대로.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import {
  buildRelationshipSystemMessage,
  streamChat,
  summarizeOlder,
  computeTurnSignals,
  VERDICT_INTHREAD_TURN_CAP,
} from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import { resolveSensitive, recordSensitiveAlert } from "@/lib/sensitive";
import { spendStars, chargeStars } from "@/lib/stars";
import { getSkill } from "@/lib/relationship/skills";
import { getActivePass, getTodayThreadTurns, getTodayExtendCount } from "@/lib/relationship/passes";
import {
  dailyTurnAllowance,
  type RelationshipMemo,
  type RelationshipStatus,
} from "@/lib/relationship/types";
import {
  splitThreadMessages,
  buildRelationshipFileBlock,
  appendSkillLog,
  cleanSummary,
  type ThreadMsg,
} from "@/lib/relationship/memory";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 8000;
const CHECKIN_RE = /\[CHECKIN:([^\]]+)\]/;
const SKILL_DONE_RE = /\[SKILL_DONE\]/;
// 판정 개시 시 별콩이의 도입(1단계)을 여는 비영속 트리거 — DB에 저장하지 않음(스레드 오염 방지).
const VERDICT_KICKOFF = "우리 사이에 다툼이 있었어. 잘잘못을 판정받고 싶어.";

interface Body {
  relationshipId: string;
  message?: string;
  skillStart?: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // Rate limit: Claude API 비용 보호 — 세션당 분당 20건 + IP당 분당 60건
  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "rel_chat_session", key: userId, max: 20, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "rel_chat_ip", key: ip, max: 60, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.relationshipId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select(
      "id, user_id, label, status, self_profile_id, partner_profile_id, thread_reading_id, rolling_summary, summarized_msg_count, memo, last_visited_at"
    )
    .eq("id", body.relationshipId)
    .maybeSingle();
  if (!rel || rel.user_id !== userId || !rel.thread_reading_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const threadReadingId = rel.thread_reading_id as string;

  const memoObj = (rel.memo ?? {}) as RelationshipMemo;
  const activeSkill = memoObj.active_skill ?? null;

  // 패스 게이트 — 활성 패스 없으면 대화 불가. 단 이미 판정(active_skill) 중이면 이미 결제된
  // 세그먼트라 통과시킨다(패스 만료 mid-verdict 에도 유료 판정을 마치게).
  const pass = await getActivePass(rel.id);
  if (!pass && !activeSkill) {
    return NextResponse.json({ error: "pass_required" }, { status: 402 });
  }

  const encoder = new TextEncoder();

  // ── 인-스레드 스킬 개시 (Phase 1: 판정) ───────────────────────────
  if (body.skillStart) {
    if (body.skillStart !== "verdict") {
      return NextResponse.json({ error: "unsupported_skill" }, { status: 400 });
    }
    if (activeSkill) {
      return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
    }
    const skill = getSkill("verdict");
    if (!skill) return NextResponse.json({ error: "skill_not_found" }, { status: 500 });

    // 30별 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
    const spend = await spendStars(userId, skill.starCost, {
      readingId: threadReadingId,
      source: "rel_skill_verdict",
    });
    if (!spend.success) {
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: skill.starCost },
        { status: 402 }
      );
    }

    // 모델 입력 = 최근창(스레드 맥락) + 비영속 판정 트리거(맨 끝 user)
    const { data: pastRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("reading_id", threadReadingId)
      .order("created_at", { ascending: true });
    const past = (pastRows ?? []) as ThreadMsg[];
    const split = splitThreadMessages(past, rel.summarized_msg_count ?? 0);
    const apiMessages = [...split.apiMessages, { role: "user" as const, content: VERDICT_KICKOFF }];

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
      activeSkill: { key: "verdict", assistantTurns: 0, forceEnd: false },
    });

    let assistantText = "";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat(systemMessage, apiMessages, 1400)) {
            assistantText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          if (!assistantText.trim()) throw new Error("empty_assistant_stream");

          // 도입 성공 → assistant 저장(skill_key 태깅) + active_skill 세팅(assistant_turns=1)
          const now = new Date().toISOString();
          await supabase.from("messages").insert([
            { reading_id: threadReadingId, role: "assistant", content: assistantText, skill_key: "verdict", created_at: now },
          ]);
          const memo = (rel.memo ?? {}) as RelationshipMemo;
          memo.active_skill = { key: "verdict", started_at: now, assistant_turns: 1 };
          await supabase.from("relationships").update({ memo, last_visited_at: now }).eq("id", rel.id);

          controller.close();
        } catch (err) {
          // 차감했는데 도입 실패 → 30별 환불 (active_skill 미설정이라 롤백 불필요)
          await chargeStars(userId, skill.starCost, `refund_${randomUUID()}`, "rel_skill_verdict_refund").catch(() => {});
          await logError(err, ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "skillStart" } }));
          controller.error(err);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── 일반 메시지 (자유대화 or 판정 세그먼트 진행) ───────────────────
  if (typeof body.message !== "string" || body.message.length < 1 || body.message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const inVerdict = activeSkill?.key === "verdict";

  // 소프트캡 — 판정 세그먼트는 캡 무관(유료·skill_key 제외). 일반 대화만 캡 톤.
  const [todayTurns, todayExtend] = await Promise.all([
    getTodayThreadTurns(threadReadingId),
    getTodayExtendCount(userId),
  ]);
  const dailyClose = !inVerdict && todayTurns >= dailyTurnAllowance(todayExtend);

  // 누적 메시지(오름차순) → 최근창/요약델타 분할
  const { data: pastRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", threadReadingId)
    .order("created_at", { ascending: true });
  const past = (pastRows ?? []) as ThreadMsg[];
  const isFirstEver = !inVerdict && past.length === 0;
  const split = splitThreadMessages(
    [...past, { role: "user", content: body.message }],
    rel.summarized_msg_count ?? 0
  );

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

  // 복귀 안부 — 판정 세그먼트 중엔 끔. pending 처방 + 마지막 방문 6h+ 조건.
  const CHECKIN_GAP_MS = 6 * 60 * 60 * 1000;
  const lastVisit = rel.last_visited_at ? new Date(rel.last_visited_at as string).getTime() : 0;
  const checkinPrompt =
    !inVerdict && memoObj.pending_checkin && Date.now() - lastVisit > CHECKIN_GAP_MS
      ? memoObj.pending_checkin.text
      : null;

  const verdictForceEnd = inVerdict && activeSkill!.assistant_turns + 1 >= VERDICT_INTHREAD_TURN_CAP;

  const systemMessage = buildRelationshipSystemMessage({
    fileBlock,
    isFirstEver,
    checkinPrompt,
    dailyClose,
    turnSignals: computeTurnSignals(past, body.message),
    activeSkill: inVerdict
      ? { key: "verdict", assistantTurns: activeSkill!.assistant_turns, forceEnd: verdictForceEnd }
      : null,
  });

  // sensitive 게이트 감지 — high 는 regex 즉시 확정, 회색지대는 haiku 2차 판정 후 확정
  const sensitiveMatch = await resolveSensitive(body.message);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Daily-Cap": dailyClose ? "reached" : "ok",
  };
  if (sensitiveMatch) {
    responseHeaders["X-Sensitive-Category"] = sensitiveMatch.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveMatch.severity);
  }

  let assistantText = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, split.apiMessages, 1400)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        if (!assistantText.trim()) throw new Error("empty_assistant_stream");

        // 판정 세그먼트: 턴캡 도달인데 마커 없으면 서버가 [SKILL_DONE] 보장
        if (inVerdict && verdictForceEnd && !SKILL_DONE_RE.test(assistantText)) {
          const tail = "\n\n[SKILL_DONE]";
          assistantText += tail;
          controller.enqueue(encoder.encode(tail));
        }

        const turnTs = Date.now();
        const skillTag = inVerdict ? "verdict" : null;
        await supabase.from("messages").insert([
          { reading_id: threadReadingId, role: "user", content: body.message, skill_key: skillTag, created_at: new Date(turnTs).toISOString() },
          { reading_id: threadReadingId, role: "assistant", content: assistantText, skill_key: skillTag, created_at: new Date(turnTs + 1).toISOString() },
        ]);

        const memo = (rel.memo ?? {}) as RelationshipMemo;
        const nowIso = new Date().toISOString();

        if (inVerdict) {
          // 판정 진행/종료 — [SKILL_DONE]이면 active_skill 해제 + skill_log 적립(recap X)
          if (SKILL_DONE_RE.test(assistantText)) {
            const summary = cleanSummary(assistantText.replace(/\[SKILL_DONE\]/g, "").trim());
            const withLog = appendSkillLog(memo, "verdict", threadReadingId, summary, nowIso);
            withLog.active_skill = null;
            await supabase.from("relationships").update({ memo: withLog, last_visited_at: nowIso }).eq("id", rel.id);
          } else {
            memo.active_skill = { key: "verdict", started_at: activeSkill!.started_at, assistant_turns: activeSkill!.assistant_turns + 1 };
            await supabase.from("relationships").update({ memo, last_visited_at: nowIso }).eq("id", rel.id);
          }
        } else {
          // 자유대화 — 복귀 안부 소진 + [CHECKIN:] 신규 파싱 (기존 로직)
          if (checkinPrompt && memo.pending_checkin) {
            memo.prescriptions = [
              ...(memo.prescriptions ?? []),
              { text: memo.pending_checkin.text, created_at: memo.pending_checkin.created_at, resolved_at: nowIso },
            ].slice(-30);
            memo.pending_checkin = null;
          }
          const checkin = assistantText.match(CHECKIN_RE);
          if (checkin) {
            memo.pending_checkin = { text: checkin[1].trim(), created_at: nowIso };
          }
          await supabase.from("relationships").update({ last_visited_at: nowIso, memo }).eq("id", rel.id);

          // 임계 요약 (fire-and-forget) — 자유대화에만
          if (split.toSummarize.length > 0) {
            void summarizeOlder(rel.rolling_summary, split.toSummarize)
              .then((sum) =>
                supabase
                  .from("relationships")
                  .update({ rolling_summary: sum, summarized_msg_count: split.newSummarizedCount })
                  .eq("id", rel.id)
              )
              .catch((e) => console.warn("[rel] summarize 실패:", e));
          }
        }

        // 민감 감지 — regex 1차 + 회색지대 haiku 2차 (판정/자유대화 공통)
        if (sensitiveMatch) {
          void recordSensitiveAlert({ match: sensitiveMatch, userId, readingId: threadReadingId, messageText: body.message });
          await supabase.from("readings").update({ has_sensitive: true }).eq("id", threadReadingId);
        }

        controller.close();
      } catch (err) {
        await logError(
          err,
          ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id } })
        );
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/chat/route.ts
git commit -m "feat(relationship): chat 라우트에 skillStart + 인-스레드 판정 모드"
```

---

## Task 7: GET `/api/relationship` — `activeSkill` 노출

**Files:**
- Modify: `app/api/relationship/route.ts:39-52`

- [ ] **Step 1: GET 응답에 `activeSkill` 추가**

`app/api/relationship/route.ts`의 GET `return NextResponse.json({...})`(39–52행)를 교체:

```ts
  const memoData = rel.memo as RelationshipMemo | null;
  return NextResponse.json({
    relationship: {
      id: rel.id, label: rel.label, status: rel.status,
      selfProfileId: rel.self_profile_id, partnerProfileId: rel.partner_profile_id,
      threadReadingId: rel.thread_reading_id, memo: rel.memo,
    },
    pass: pass ? { kind: pass.kind, expiresAt: pass.expires_at } : null,
    daily: pass
      ? { used: todayTurns, allowance: dailyTurnAllowance(todayExtend), extendCount: todayExtend }
      : null,
    messages: msgRows ?? [],
    recap: memoData?.pending_skill_recap ?? null,
    activeSkill: memoData?.active_skill?.key ?? null,
  });
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (`RelationshipMemo`는 이미 import됨 — 8행)

- [ ] **Step 3: 커밋**

```bash
git add app/api/relationship/route.ts
git commit -m "feat(relationship): GET 응답에 activeSkill 노출"
```

---

## Task 8: 연애 페르소나 — verdict 인-스레드 제안 톤

기존 `byeolkong_relationship.md` §스킬 제안은 "보고 오면 그거 갖고 여기서 이어서 얘기하자"(이동형 연속성 예고)를 요구한다. verdict는 이제 화면 이동 없이 **바로 이 스레드에서** 진행되므로 그 예고 톤이 맞지 않는다. verdict만 별도 안내를 추가(compat/checkin/deep_feelings는 아직 이동형이라 그대로).

**Files:**
- Modify: `data/persona/byeolkong_relationship.md:74` (연속성 예고 규칙 뒤)

- [ ] **Step 1: verdict 예외 한 줄 추가**

`data/persona/byeolkong_relationship.md`의 "연속성 예고 (필수)" 불릿(74행) 바로 뒤, "(주의: 여기 `checkin` 스킬은…"(75행) 앞에 새 불릿을 삽입:

```markdown
- **`verdict`(싸움 판정)는 예외 — 인-스레드**: 판정은 다른 화면으로 가지 않고 **바로 이 대화 안에서** 진행돼. 그러니 verdict를 제안할 땐 "갔다 와서 이어서"가 아니라 "지금 여기서 같이 하나하나 따져보자" 톤으로. 예) "누가 얼마나 잘못한 건지, 지금 여기서 양쪽 얘기 다 들어보고 별콩이가 판정해줄게."
```

- [ ] **Step 2: 커밋**

```bash
git add data/persona/byeolkong_relationship.md
git commit -m "feat(relationship): 페르소나 — verdict는 인-스레드 제안 톤"
```

---

## Task 9: `useSkillLaunch` — `onInThreadSkill` (launchDialogue 제거)

dialogue(판정)를 별도 라우트/이동 대신 ThreadChat이 제공한 `onInThreadSkill` 콜백으로 개시. 확인 모달(30⭐)은 유지 — "확인하고 시작" 시 콜백을 호출하고 모달을 닫는다(차감은 서버 skillStart가 담당). compat/tarot_draw 분기는 그대로.

**Files:**
- Modify: `lib/relationship/useSkillLaunch.ts:17-21`(args), `106-134`(launchDialogue 삭제), `151-164`(runLaunch)

- [ ] **Step 1: args에 `onInThreadSkill` 추가**

`UseSkillLaunchArgs`(17–21행)를 교체:

```ts
export interface UseSkillLaunchArgs {
  relationshipId: string;
  selfProfileId: string | null;
  partnerProfileId: string | null;
  /** dialogue 스킬(판정)을 스레드 안에서 개시 — ThreadChat이 skillStart 전송을 담당. */
  onInThreadSkill?: (skillKey: string) => void;
}
```

- [ ] **Step 2: 훅 파라미터 구조분해에 추가**

`useSkillLaunch({ relationshipId, selfProfileId, partnerProfileId }: ...)`(40–44행)를 교체:

```ts
export function useSkillLaunch({
  relationshipId,
  selfProfileId,
  partnerProfileId,
  onInThreadSkill,
}: UseSkillLaunchArgs): UseSkillLaunchResult {
```

- [ ] **Step 3: `launchDialogue` 함수 삭제**

`lib/relationship/useSkillLaunch.ts`의 `launchDialogue` 정의(106–134행 전체 — `const launchDialogue = async (skill: RelationshipSkill) => { ... };`)를 삭제.

- [ ] **Step 4: `runLaunch`의 dialogue 분기 교체**

`runLaunch`(151–164행)를 교체:

```ts
  const runLaunch = (skill: RelationshipSkill) => {
    if (inFlightRef.current || busyKey) return;
    if (skill.kind === "compat") {
      inFlightRef.current = true;
      void launchCompat(skill).finally(() => {
        inFlightRef.current = false;
      });
    } else if (skill.kind === "dialogue") {
      // 인-스레드 개시 — 별도 페이지/차감 없음. 차감은 chat 라우트(skillStart)가 담당.
      onInThreadSkill?.(skill.key);
      cancelConfirm();
    }
  };
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`router`는 launchCompat/launchTarotDraw가 계속 사용하므로 import 유지)

- [ ] **Step 6: 커밋**

```bash
git add lib/relationship/useSkillLaunch.ts
git commit -m "feat(relationship): useSkillLaunch onInThreadSkill 콜백(launchDialogue 제거)"
```

---

## Task 10: `ThreadChat` — skillStart 전송 + active_skill UX

skillStart 전송(`sendSkillStart`), `activeSkill` 상태(입력 유지·다른 스킬 잠금·캡 우회), `[SKILL_DONE]` 감지 후 종료 + 부모 새로고침, 마커 숨김을 추가. 6개 국소 편집.

**Files:**
- Modify: `components/relationship/ThreadChat.tsx`

- [ ] **Step 1: 마커 상수에 `[SKILL_DONE]` 추가**

`MARKER_REGEX`·`TRAILING_PARTIAL_MARKER`(24–29행) 및 그 뒤에 `SKILL_DONE_RE`를 교체/추가:

```ts
// 완성된 마커 — 화면에 절대 노출 금지 (백엔드 전용 기록/제안/종료 마커)
const MARKER_REGEX = /\[(?:SKILL:[a-z_]+|SKILL_DONE|CHECKIN:[^\]]+)\]/g;
// 스트리밍 중 아직 안 닫힌 마커의 꼬리 — 닫히기 전까지 미리보여 깜빡이지 않게 숨김
// (SKILL 브랜치에 _DONE 부분 매칭 추가 — [SKILL_DONE] 스트리밍 꼬리 커버)
const TRAILING_PARTIAL_MARKER =
  /\[(?:S(?:K(?:I(?:L(?:L(?:_(?:D(?:O(?:N(?:E)?)?)?)?|:[a-z_]*)?)?)?)?)?|C(?:H(?:E(?:C(?:K(?:I(?:N(?::[^\]]*)?)?)?)?)?)?)?)?$/;
// 완성된 [SKILL:key] 캡처용 — 마커 존재 시 그 자리에 실행 칩을 띄우기 위해 key 를 뽑아낸다.
const SKILL_MARKER_CAPTURE = /\[SKILL:([a-z_]+)\]/;
// 인-스레드 스킬 종료 마커 — 감지 시 활성 스킬 해제.
const SKILL_DONE_RE = /\[SKILL_DONE\]/;
```

- [ ] **Step 2: props에 `initialActiveSkill`·`onSkillDone` 추가**

`ThreadChatProps`(64–83행)의 `skillRecap` 필드 뒤에 추가:

```ts
  /** 마운트 시점의 진행 중 스킬 key (GET /api/relationship activeSkill). 없으면 null. */
  initialActiveSkill?: string | null;
  /** 인-스레드 스킬이 [SKILL_DONE]으로 종료됐을 때 — 부모가 상태 새로고침(캡·activeSkill 재동기화). */
  onSkillDone?: () => void;
```

- [ ] **Step 3: 구조분해 + activeSkill 상태 + 훅 콜백**

컴포넌트 인자 구조분해(85–97행)에 `initialActiveSkill = null,`·`onSkillDone,`를 추가하고, `useSkillLaunch({...})` 호출에 `onInThreadSkill`을 전달, `activeSkill` 상태를 추가. 아래처럼:

```ts
export default function ThreadChat({
  relationshipId,
  initialMessages,
  canSend,
  capReached,
  selfProfileId = null,
  partnerProfileId = null,
  skillRecap = null,
  initialActiveSkill = null,
  onDailyCapReached,
  onExtended,
  onPassRequired,
  onSkillDone,
  className = "",
}: ThreadChatProps) {
  const router = useRouter();
  const [activeSkill, setActiveSkill] = useState<string | null>(initialActiveSkill);
  const { launch, busyKey, toastMsg, pendingSkill, confirmBalance, confirmLaunch, cancelConfirm } =
    useSkillLaunch({
      relationshipId,
      selfProfileId,
      partnerProfileId,
      onInThreadSkill: (key) => void sendSkillStart(key),
    });
```

> 주의: `sendSkillStart`는 아래(Step 5)에서 `send` 뒤에 정의된다. 화살표 콜백이 렌더 시점이 아니라 호출 시점에 참조하므로 순서 문제 없음.

- [ ] **Step 4: `send` 가드 완화 + [SKILL_DONE] 감지**

`send`(183–251행)에서 (a) 첫 줄 가드와 (b) 스트림 종료 후 assistant 반영 부분을 교체.

가드(184행) 교체:

```ts
    // 판정(activeSkill) 중엔 소프트캡·canSend 게이트를 우회(유료 세그먼트).
    if (!text.trim() || sending) return;
    if (!activeSkill && (capReachedLocal || !canSend)) return;
```

스트림 종료 후 assistant 반영(233–245행) 교체:

```ts
      if (acc.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: acc, createdAt: new Date().toISOString() },
        ]);
        // 인-스레드 스킬 종료 — 활성 해제 + 부모 새로고침(캡·activeSkill 재동기화)
        if (SKILL_DONE_RE.test(acc)) {
          setActiveSkill(null);
          onSkillDone?.();
        }
      }
      setLiveText("");
      setSending(false);

      if (capHeader === "reached") {
        setCapReachedLocal(true);
        onDailyCapReached?.();
      }
```

- [ ] **Step 5: `sendSkillStart` 함수 추가**

`send` 함수 정의 바로 뒤(251행 `};` 다음)에 추가:

```ts

  // 인-스레드 스킬 개시 — 유저 발화 없이 skillStart 전송, 별콩이 도입을 스트리밍.
  const sendSkillStart = async (skillKey: string) => {
    if (sending || activeSkill) return;
    setError(null);
    setActiveSkill(skillKey); // 낙관적 — 실패 시 아래에서 롤백
    setSending(true);
    setLiveText("");
    try {
      const res = await fetch("/api/relationship/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, skillStart: skillKey }),
      });
      if (res.status === 402) {
        setSending(false);
        setActiveSkill(null);
        router.push("/shop");
        return;
      }
      if (!res.ok || !res.body) {
        setSending(false);
        setActiveSkill(null);
        setError("지금은 시작할 수 없어. 잠시 후 다시 시도해줄래?");
        return;
      }
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLiveText(acc);
      }
      if (acc.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: acc, createdAt: new Date().toISOString() },
        ]);
      } else {
        setActiveSkill(null); // 빈 도입 = 서버가 환불 처리 → 활성 롤백
        setError("별콩이가 잠깐 멈칫했어. 다시 시도해줄래?");
      }
      setLiveText("");
      setSending(false);
    } catch {
      setSending(false);
      setActiveSkill(null);
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    }
  };
```

- [ ] **Step 6: 다른 스킬 잠금(판정 중) + 입력 노출 조건**

(a) [SKILL:key] 마커 칩 버튼(352–365행)의 `disabled`에 activeSkill 잠금 추가 — `disabled={busyKey === skill.key || !!activeSkill}`.

(b) ⚡ 스킬 열기 버튼(421–430행)을 activeSkill 중엔 비활성:

```tsx
              <button
                type="button"
                onClick={() => { if (!activeSkill) setShowSkills(true); }}
                disabled={!!activeSkill}
                aria-label="스킬 열기"
                className="shrink-0 h-[44px] w-[44px] rounded-xl bg-gold-soft/40 text-gold flex items-center justify-center active:scale-95 transition disabled:opacity-40"
              >
```

(c) 입력 영역 조건(401–473행) — capReached여도 activeSkill 중이면 입력 폼 노출. 최상위 삼항(401행 `{capReachedLocal ? (`)을 교체:

```tsx
          {!activeSkill && capReachedLocal ? (
```

그리고 그 삼항의 `) : canSend ? (`(419행)를 교체:

```tsx
          ) : (canSend || activeSkill) ? (
```

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add components/relationship/ThreadChat.tsx
git commit -m "feat(relationship): ThreadChat skillStart 전송 + 판정 중 UX(잠금·캡우회·SKILL_DONE)"
```

---

## Task 11: `app/relationship/page.tsx` — activeSkill 배선

GET의 `activeSkill`을 상태로 받아 ThreadChat에 `initialActiveSkill`로 전달 + `onSkillDone`으로 새로고침.

**Files:**
- Modify: `app/relationship/page.tsx:60`(state), `78-90`(load), `279-291`(S3/S4 ThreadChat), `226-233`(S2 ThreadChat)

- [ ] **Step 1: activeSkill 상태 추가**

`const [recap, setRecap] = useState<...>(null);`(60행) 뒤에 추가:

```ts
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
```

- [ ] **Step 2: load()에서 activeSkill 세팅**

`setRecap((rel?.recap as ...) ?? null);`(89행) 뒤에 추가:

```ts
    setActiveSkill((rel?.activeSkill as string | null) ?? null);
```

- [ ] **Step 3: S3/S4 ThreadChat에 prop 전달**

S3/S4 렌더의 `<ThreadChat ... />`(279–291행)에 `initialActiveSkill`·`onSkillDone`를 추가:

```tsx
        <ThreadChat
          className="flex-1 min-h-0"
          relationshipId={relationship.id}
          initialMessages={messages}
          canSend={!capReached}
          capReached={capReached}
          selfProfileId={relationship.selfProfileId}
          partnerProfileId={relationship.partnerProfileId}
          skillRecap={recap}
          initialActiveSkill={activeSkill}
          onDailyCapReached={() => void load()}
          onExtended={() => void load()}
          onPassRequired={() => void load()}
          onSkillDone={() => void load()}
        />
```

> S2(패스 없음) 렌더의 ThreadChat(226–233행)은 `canSend={false}` 읽기전용이고 활성 패스가 없으면 판정도 불가하므로 `initialActiveSkill`을 넘기지 않는다(기본 null). 변경 없음.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/relationship/page.tsx
git commit -m "feat(relationship): 페이지에서 activeSkill을 ThreadChat에 배선"
```

---

## Task 12: 구 verdict 페이지/라우트 + 고아 코드 제거

인-스레드로 대체됐으니 구 verdict 흐름을 제거. 삭제로 고아가 된 `lib/claude.ts` verdict 헬퍼 + 페르소나 파일도 함께 정리(내 변경이 만든 dead code — CLAUDE.md §3).

**Files:**
- Delete: `app/relationship/verdict/[id]/page.tsx`, `app/api/relationship/verdict/route.ts`, `app/api/relationship/verdict/chat/route.ts`, `data/persona/byeolkong_verdict.md`
- Modify: `lib/claude.ts:643-689`(verdict 블록 제거)

- [ ] **Step 1: 구 파일 삭제**

```bash
git rm "app/relationship/verdict/[id]/page.tsx" \
       app/api/relationship/verdict/route.ts \
       app/api/relationship/verdict/chat/route.ts \
       data/persona/byeolkong_verdict.md
# 빈 디렉터리 정리 (윈도우: 남아있으면 수동 삭제)
```

- [ ] **Step 2: `lib/claude.ts`의 고아 verdict 코드 삭제**

`lib/claude.ts`에서 아래를 삭제:
- `// ===== 관계 스킬 — 싸움 잘잘못 판정 (dialogue, 수렴형) =====` 주석부터
- `getVerdictPersona`·`_cachedVerdictPersona`
- `export const VERDICT_ABS_TURN_CAP = 5;`
- `export interface VerdictTurnContext { ... }`
- `export function buildVerdictSystemMessage(ctx) { ... }`

즉 643행 `// ===== 관계 스킬 …`부터 689행 `buildVerdictSystemMessage` 닫는 `}`까지 블록 전체를 제거. (그 뒤 `summarizeOlder`는 유지.)

- [ ] **Step 3: 잔여 참조 확인**

Run: `git grep -n "buildVerdictSystemMessage\|VERDICT_ABS_TURN_CAP\|getVerdictPersona\|relationship/verdict\|byeolkong_verdict\.md"`
Expected: `qa/` 하네스와 `docs/`·`scripts/`만 남음(Task 13에서 하네스 처리). `app/`·`lib/`·`components/`엔 0.

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (고아 export 제거 후에도 앱 코드 참조 없음)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore(relationship): 구 verdict 페이지·라우트·고아 코드 제거(인-스레드로 대체)"
```

---

## Task 13: QA 하네스 — verdict를 인-스레드로 재배선

하네스가 삭제된 `/api/relationship/verdict*`를 호출하므로, verdict를 관계 스레드 + `skillStart`로 구동하도록 재배선. verdict 종료는 `[SKILL_DONE]`.

**Files:**
- Modify: `qa/client.ts`(postRelChat body), `qa/driver.ts`(chatPath·sendOne·skillStart 개시·checkStop), `qa/readings.ts`(createVerdictReading), `qa/evaluate/assertions.ts`(hasSkillDoneMarker·endsWithQuestion), `qa/cases/relationship.ts`(주석)

- [ ] **Step 1: `postRelChat` body에 skillStart 허용**

`qa/client.ts`의 `postRelChat` 시그니처(46–49행)를 교체:

```ts
export async function postRelChat(
  path: string,
  body: { relationshipId: string; message?: string; skillStart?: string }
): Promise<ChatResponse> {
```

(본문은 `JSON.stringify(body)` 그대로 — 변경 없음)

- [ ] **Step 2: `assertions.ts`에 SKILL_DONE 헬퍼 + endsWithQuestion 보정**

`qa/evaluate/assertions.ts`의 `hasEndMarker`(10–12행) 뒤에 추가:

```ts

/** 인-스레드 스킬(판정) 종료 마커. */
export function hasSkillDoneMarker(text: string): boolean {
  return /\[SKILL_DONE\]/.test(text);
}
```

그리고 `endsWithQuestion`의 strip 정규식(18행)에 `SKILL_DONE`를 추가:

```ts
  const s = text
    .replace(/\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+|SKILL:[a-z_]+|SKILL_DONE|CHECKIN:[^\]]+)\]/gi, "")
    .trim();
```

- [ ] **Step 3: `driver.ts` — chatPath·sendOne·개시·checkStop**

(a) `chatPath`(10–21행) 교체 — verdict를 관계 라우트로:

```ts
function chatPath(c: Case): string {
  switch (c.product.kind) {
    case "saju":
      return "/api/consultations/saju/chat";
    case "tarot":
      return "/api/consultations/tarot/chat";
    case "relationship":
    case "verdict":
      return "/api/relationship/chat";
  }
}
```

(b) `sendOne`의 relationship 분기(44–53행)를 relationship+verdict 공용으로 교체:

```ts
  if (c.product.kind === "relationship" || c.product.kind === "verdict") {
    // 스레드/판정 모두 서버가 히스토리 관리 → 단발 message + relationshipId(= t.readingId)
    res = await postRelChat(chatPath(c), {
      relationshipId: t.readingId,
      message: userText,
    });
  } else {
```

(c) `import`에 `hasSkillDoneMarker` 추가(7행):

```ts
import { hasEndMarker, hasSkillDoneMarker } from "./evaluate/assertions.ts";
```

(d) `checkStop`의 [END] 종료 판정(76–79행)에 SKILL_DONE 추가:

```ts
  if (hasEndMarker(turn.assistantText) || hasSkillDoneMarker(turn.assistantText)) {
    t.finishReason = "ended";
    return true;
  }
```

(e) `runConversation`에서 첫 `sendOne`(120행) 앞에 verdict 개시(skillStart) 삽입. `try {` 다음, `const first = await sendOne(...)` 위에:

```ts
    // verdict: 판정 개시 — skillStart로 30별 차감 + 별콩이 도입(유저 발화 없음)
    if (c.product.kind === "verdict") {
      await sleep(config.PACING_MS);
      const kickoff = await postRelChat("/api/relationship/chat", {
        relationshipId: t.readingId,
        skillStart: "verdict",
      });
      t.turns.push({ userText: "", assistantText: kickoff.text, headers: kickoff.headers, status: kickoff.status, eventType: "say" });
      if (checkStop(t, t.turns[t.turns.length - 1])) {
        t.endBalance = await getBalance();
        return t;
      }
    }
```

- [ ] **Step 4: `readings.ts` — createVerdictReading 재작성**

`qa/readings.ts`의 `createVerdictReading`(123–153행)을 교체 — 별도 verdict 세션 POST 제거, rel+pass만(차감 30은 driver의 skillStart가 수행):

```ts
export async function createVerdictReading(c: Case): Promise<CreatedReading> {
  if (c.product.kind !== "verdict") throw new Error("not verdict case");
  await resetRelationship();

  const reg = await postJson<{ id?: string; error?: string }>(
    "/api/relationship",
    { label: "QA상대", status: c.product.status }
  );
  if (reg.status !== 200 || !reg.json.id)
    throw new Error(`[readings] verdict용 relationship 등록 실패 ${reg.status}: ${JSON.stringify(reg.json)}`);
  const relationshipId = reg.json.id;

  const plan = PASS_PLAN_BY_KIND[c.product.passKind];
  const pass = await postJson<{ success?: boolean }>(
    "/api/relationship/pass",
    { relationshipId, kind: c.product.passKind }
  );
  if (pass.status !== 200 || !pass.json.success)
    throw new Error(`[readings] verdict용 패스 구매 실패 ${pass.status}`);

  // 판정 개시(30별 차감)는 driver가 skillStart로 수행. 총 차감 = 패스 + 판정 30.
  const verdictCost = getSkill("verdict")?.starCost ?? 0;
  return { readingId: relationshipId, cost: plan.cost + verdictCost };
}
```

- [ ] **Step 5: `cases/relationship.ts` verdict 주석 갱신**

`verdictCases`의 주석(149–150행)을 교체 (기능 무관, 정확성):

```ts
/** verdict(싸움 잘잘못 판정) — 인-스레드. skillStart로 개시 → 관계 스레드에서 진행 →
 *  VERDICT_INTHREAD_TURN_CAP(6)에서 서버가 [SKILL_DONE] 보장. driver가 skillStart+postRelChat로 구동. */
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add qa/
git commit -m "test(relationship): QA 하네스 verdict를 인-스레드(skillStart)로 재배선"
```

---

## Task 14: 최종 검증 (build + 유닛 + 하네스 + 브라우저 E2E)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 유닛 테스트**

Run: `node --import tsx --test lib/relationship/memory.test.ts lib/continuation.test.ts lib/acquisition.test.ts qa/report.test.ts`
Expected: 전부 PASS

- [ ] **Step 2: 프로덕션 빌드 (타입 + 라우트)**

Run: `npm run build`
Expected: 성공. `/api/relationship/verdict*` 라우트가 빌드 목록에서 사라지고, `/api/relationship/chat`·`/relationship`은 유지. 컴파일 에러 0.

- [ ] **Step 3: dev 서버 재시작 (페르소나/모듈 캐시)**

> ⚠️ 페르소나 파일(`byeolkong_verdict_inthread.md`)과 `lib/claude.ts` 모듈 캐시 때문에, 검증 전 dev 서버를 **반드시 재시작**(메모리 [[qa-harness-usage]]).

- [ ] **Step 4: QA 하네스 — verdict 페르소나 검증**

`.env.local`(dev Supabase)로 verdict 케이스를 구동해 3단계 진행 + `[SKILL_DONE]` 종료 + 별 차감(패스+30)을 확인.

Run: `npm run qa` (전체) 또는 `qa/run.ts`가 케이스 필터를 지원하면 verdict만.
Expected: `relationship.verdict.happy_path`·`relationship.verdict.definitive_pressure`가 `finishReason: "ended"`, `star_deduction` 통과, 심판 dimensions 통과. (라이브 Claude API 호출 — 토큰 비용 발생. 필터 미지원 시 `qa/cases/index`에서 일시적으로 verdict만 남겨 실행 후 원복.)

- [ ] **Step 5: dev push (마이그레이션 자동 적용)**

```bash
git push origin dev
```
Supabase GitHub sync가 `20260724000000_messages_skill_key.sql`을 dev 브랜치 DB에 적용 — Branches → dev → Workflow logs에서 SUCCESS 확인.

- [ ] **Step 6: 브라우저 E2E 체크리스트 (dev, 사용자 수행)**

dev(`https://dev.byeolkongtalk.com`)에서 카카오 로그인 → `/relationship`(등록+패스 상태)에서:
1. ⚡ 시트 또는 별콩이 [SKILL:verdict] 칩 → 확인 모달(30⭐) → "확인하고 시작" → **같은 스레드에서** 별콩이 판정 도입(딴 페이지 이동 없음). 30⭐ 차감 확인.
2. 양쪽 입장 몇 턴 → 비율 판정 + 화해 처방 + 자연 복귀(스레드 그대로). `[SKILL_DONE]`/마커는 화면에 안 보임.
3. 판정 중엔 다른 스킬 칩/⚡ 잠김. 판정 세그먼트 턴이 **일일 소프트캡(20)에 안 잡힘** — 판정 후 자유대화 잔여 턴 온전.
4. 판정 도중 새로고침 → 이어서 진행(`activeSkill` 유지). 판정 종료 후 새로고침 → 일반 대화(activeSkill 해제).
5. 별 부족 상태로 개시 → `/shop` 유도(차감·active_skill 미설정).

- [ ] **Step 7: main fast-forward (사용자 승인 후)**

브라우저 E2E OK면:
```bash
git checkout main && git merge --ff-only dev && git push origin main
git checkout dev
```
(prod 마이그레이션도 Supabase sync로 자동 — main Workflow logs SUCCESS 확인. 무중단·additive.)

---

## Self-Review

**1. 스펙 커버리지**
- 확인 모달(30⭐) → 인-스레드 판정 → 복귀: Task 9(모달·콜백)+6(skillStart 차감)+10(스트림)+8(제안 톤). ✅
- 별도 페이지/reading 없음: Task 6(스레드 reading 재사용)+12(구 페이지·라우트 삭제). ✅
- 30⭐ 유료 + 캡 제외: Task 1(skill_key)+2(카운트 제외)+6(차감·태깅·캡우회). ✅
- `[SKILL_DONE]` + 안전 턴캡: Task 5(가이드·CAP)+6(forceEnd·마커 보장). ✅
- skill_log만 적립(recap X): Task 3(appendSkillLog)+6(호출). ✅
- 인-스레드 페르소나: Task 4·5. ✅
- P1 판정 제안: Task 8. ✅
- GET activeSkill: Task 7. ✅
- 클라 잠금·캡우회: Task 10·11. ✅
- 제거 목록: Task 12. ✅
- 엣지(중복 400·미완료 이탈·환불·캡 상호작용): Task 6(skill_already_active 400·active_skill 유지·환불·skill_key 제외). ✅
- 테스트(유닛·하네스·E2E): Task 3·13·14. ✅

**2. 플레이스홀더 스캔** — TODO/TBD/"적절히 처리" 없음. 모든 코드 스텝에 완전한 코드. ✅

**3. 타입 일관성**
- `RelationshipMemo.active_skill`(Task1) `{key,started_at,assistant_turns}` → 라우트(Task6)·GET(Task7)에서 동일 필드명.
- `RelationshipTurnContext.activeSkill`(Task5) `{key,assistantTurns,forceEnd}` → 라우트(Task6) 호출 동일. (memo의 snake `assistant_turns` ↔ context의 camel `assistantTurns`는 Task6에서 명시 변환 — 라우트가 `assistantTurns: activeSkill!.assistant_turns` 매핑.)
- `appendSkillLog(memo,skillKey,readingId,summary,nowIso)`(Task3) → 라우트(Task6) 동일 시그니처.
- `VERDICT_INTHREAD_TURN_CAP`(Task5) → 라우트(Task6) import 동일.
- `onInThreadSkill`(Task9) → ThreadChat(Task10) 전달 동일.
- `initialActiveSkill`/`onSkillDone`(Task10 props) → page(Task11) 전달 동일.
- `hasSkillDoneMarker`(Task13 assertions) → driver(Task13) import 동일.

**주의(구현자용):** memo의 `active_skill.assistant_turns`(snake)와 context의 `activeSkill.assistantTurns`(camel)는 의도적으로 다름 — 라우트에서 변환. 혼동 금지.
