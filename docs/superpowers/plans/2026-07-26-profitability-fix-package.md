# 수익성 재구조화 — 픽스 패키지 (P0·P1·P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 §4의 제품 픽스 패키지를 한 번에 빌드해 prod 배포(= day 0 기준점)한다 — P0 리텐션 엔진 시동(우리 사이 무료 3턴 + turn-1 출구 칩), P1 페르소나 일괄 수정(회피구·premium-depth·CARD 마커), P2 원가·정리·계측(reco 중단·죽은 SKU·탈퇴 utm 스냅샷·landing_variant 분리).

**Architecture:** 서버 권위 원칙 유지 — 무료 3턴 판정은 messages 테이블 카운트로 서버가 결정, 클라는 표시만. 페르소나 수정은 md 파일 + lib/claude.ts 동적 가이드 주입(모듈 캐시라 **dev 서버 재시작 필수**). reco 는 [RECO:] 인챗 칩(clarifier/extend)은 남기고 next_reco 저장·haiku 태깅·결과 카드만 제거.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase(service role), node:test + tsx.

**스펙:** [2026-07-25-profitability-restructure-design.md](../specs/2026-07-25-profitability-restructure-design.md) §4

**검증 컨벤션:** 레포에 테스트 러너 스크립트 없음 — 유닛은 `node --import tsx --test <파일>`, 타입은 `npx tsc --noEmit`, 통합은 `npm run build` + 로컬 브라우저 플로우. 페르소나 변경은 QA 하네스([[qa-harness-usage]]) 또는 로컬 실대화로 확인하되 **dev 서버 재시작 후**에만 반영된다.

---

### Task 1: P0-1 서버 — 우리 사이 무료 인트로 3턴 (패스 게이트 완화)

**Files:**
- Modify: `lib/relationship/types.ts` (상수 추가)
- Modify: `lib/claude.ts` (RelationshipTurnContext + 무료 인트로 가이드)
- Modify: `app/api/relationship/chat/route.ts:139-147` (게이트), `:543-547` (소프트캡), `:583-592` (system message)

- [ ] **Step 1: `lib/relationship/types.ts`에 상수 추가**

`DAILY_TURN_CAP` 등 상수들이 모여 있는 위치(클라이언트 안전 순수 모듈)에 추가:

```ts
/** 패스 없이 열리는 무료 첫 대화 — 스레드 누적 유저 발화 기준 (서버 권위: messages 카운트).
 * 근거: 2026-07-25 P&L — 등록 15 중 14 무발화, 그중 5명이 현금 결제자 = 지불 의사가 아니라 순서 문제. */
export const FREE_INTRO_TURNS = 3;
```

- [ ] **Step 2: `lib/claude.ts` — RelationshipTurnContext에 freeIntro 추가**

`RelationshipTurnContext` 인터페이스(현재 `drawContext` 필드 아래)에 추가:

```ts
  /** 패스 없는 무료 인트로 턴 — turn=이번이 몇 번째(1~3), last=이번이 마지막 무료 턴. 없으면 null. */
  freeIntro?: { turn: number; last: boolean } | null;
```

- [ ] **Step 3: `lib/claude.ts` — buildRelationshipSystemMessage에 가이드 주입**

`closeGuide` 선언 바로 아래에 추가:

```ts
  const freeIntroGuide = ctx.freeIntro
    ? ctx.freeIntro.last
      ? `\n\n## 무료 첫 대화 마무리 (${ctx.freeIntro.turn}/3턴 — 이번이 마지막 무료 턴)\n지금은 패스 없이 열린 무료 첫 대화의 마지막 턴이야. 이번 응답은 (1) 지금까지 들은 상황과 감정을 따뜻하게 짚어 정리하고 (2) 이 관계를 앞으로도 계속 같이 보고 싶다는 마음을 전하며 (3) "패스를 켜면 지금 이 대화 그대로 이어서 매일 얘기할 수 있어" 결로 부드럽게 닫아. 가격·별 개수 언급 금지, 결제 강요 금지, [END] 금지, 새 질문으로 닫지 말 것.`
      : `\n\n## 무료 첫 대화 (패스 전, ${ctx.freeIntro.turn}/3턴)\n지금은 패스 없이 열린 무료 첫 대화야. 관계 파일을 채워가듯 상황을 자연스럽게 파악하고 공감과 방향 중심으로 답해 — 패스·결제 언급은 하지 마.`
    : "";
```

그리고 `dynamicPart` 템플릿의 `${closeGuide}` 바로 뒤에 `${freeIntroGuide}` 삽입:

```ts
  const dynamicPart = `---
## 이번 세션 정보
${ctx.fileBlock}
---${firstGuide}${checkinGuide}${closeGuide}${freeIntroGuide}${verdictGuide}${drawGuide}${buildTurnSignalBlock(ctx.turnSignals)}`;
```

- [ ] **Step 4: `app/api/relationship/chat/route.ts` — 패스 게이트 교체**

import에 `FREE_INTRO_TURNS` 추가 (`dailyTurnAllowance` 옆):

```ts
import {
  dailyTurnAllowance,
  FREE_INTRO_TURNS,
  type RelationshipMemo,
  type RelationshipStatus,
} from "@/lib/relationship/types";
```

기존 게이트 블록(139-147행):

```ts
  const inDialogueSkill = !!activeSkill && getSkill(activeSkill.key)?.kind === "dialogue";
  const pass = await getActivePass(rel.id);
  if (!pass && !inDialogueSkill) {
    return NextResponse.json({ error: "pass_required" }, { status: 402 });
  }
```

를 아래로 교체 (기존 주석은 유지하고 무료 인트로 설명을 덧붙임):

```ts
  const inDialogueSkill = !!activeSkill && getSkill(activeSkill.key)?.kind === "dialogue";
  const pass = await getActivePass(rel.id);
  // 무료 인트로 — 패스 없어도 스레드 누적 유저 발화 FREE_INTRO_TURNS회까지 자유대화 허용
  // (등록→첫 발화 퍼널 개방). 스킬 개시(skillStart)는 대상 아님 — 스킬은 항상 패스 필요.
  let freeIntro: { turn: number; last: boolean } | null = null;
  if (!pass && !inDialogueSkill) {
    if (body.skillStart) {
      return NextResponse.json({ error: "pass_required" }, { status: 402 });
    }
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("reading_id", threadReadingId)
      .eq("role", "user");
    const used = count ?? 0;
    if (used >= FREE_INTRO_TURNS) {
      return NextResponse.json({ error: "pass_required" }, { status: 402 });
    }
    freeIntro = { turn: used + 1, last: used + 1 >= FREE_INTRO_TURNS };
  }
```

- [ ] **Step 5: 소프트캡·system message에 freeIntro 반영**

`dailyClose` 계산(547행 부근)을:

```ts
  const dailyClose = !inVerdict && !graceKey && !freeIntro && todayTurns >= dailyTurnAllowance(todayExtend);
```

`buildRelationshipSystemMessage` 호출(583행 부근)의 인자에 추가:

```ts
  const systemMessage = buildRelationshipSystemMessage({
    fileBlock,
    isFirstEver,
    checkinPrompt,
    dailyClose,
    freeIntro,
    turnSignals: computeTurnSignals(past, userMessage),
    activeSkill: inVerdict
      ? { key: "verdict", assistantTurns: activeSkill!.assistant_turns, forceEnd: verdictForceEnd }
      : null,
  });
```

- [ ] **Step 6: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 7: Commit**

```bash
git add lib/relationship/types.ts lib/claude.ts app/api/relationship/chat/route.ts
git commit -m "feat(relationship): 무료 인트로 3턴 — 패스 게이트 완화 + 마지막 턴 마무리 가이드 (P0-1 서버)"
```

---

### Task 2: P0-1 클라 — S2(패스 없음) 상태에서 무료 인트로 입력 개방

**Files:**
- Modify: `app/relationship/page.tsx:202-264` (S2 분기)

- [ ] **Step 1: import에 FREE_INTRO_TURNS 추가**

`app/relationship/page.tsx`의 `@/lib/relationship/types` import 목록에 `FREE_INTRO_TURNS` 추가.

- [ ] **Step 2: S2 분기를 무료 인트로 우선으로 교체**

기존 `if (!hasPass) {` 블록 시작부(202-208행)를 아래로 교체 — 무료 턴이 남았으면 S3 골격(입력 가능)으로 렌더하고 배너만 얹는다:

```tsx
    // S2 — 활성 패스 없음. 단 무료 인트로(유저 발화 3회)가 남았으면 입력 열린 스레드로.
    const usedFreeTurns = messages.filter((m) => m.role === "user").length;
    const freeLeft = !hasPass ? Math.max(0, FREE_INTRO_TURNS - usedFreeTurns) : 0;

    if (!hasPass && freeLeft > 0) {
      return (
        <main
          className="flex flex-col items-stretch w-full min-h-0"
          style={{ height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))" }}
        >
          <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-4 pb-3">
            {headerCard}
            {partnerBanner}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-lilac-mid/30 bg-lilac-soft/40 px-3.5 py-2.5">
              <p className="text-[11.5px] text-eye-purple leading-snug">
                💜 무료 첫 대화 <b>{usedFreeTurns + 1}/{FREE_INTRO_TURNS}턴</b> — 먼저 편하게 얘기해봐
              </p>
              <button
                type="button"
                onClick={() => setShowPassSheet(true)}
                className="shrink-0 text-[11px] font-bold text-lilac-deep active:scale-95 transition"
              >
                패스 보기 ›
              </button>
            </div>
          </div>

          <ThreadChat
            className="flex-1 min-h-0"
            relationshipId={relationship.id}
            initialMessages={messages}
            canSend={true}
            capReached={false}
            selfProfileId={relationship.selfProfileId}
            partnerProfileId={relationship.partnerProfileId}
            partnerLabel={relationship.label}
            initialActiveSkill={activeSkill}
            onPassRequired={() => void load()}
            onSkillDone={() => void load()}
          />

          {editModal}
          {showPassSheet && (
            <PassSheet
              relationshipId={relationship.id}
              pass={null}
              daily={null}
              balance={balance ?? undefined}
              onClose={() => setShowPassSheet(false)}
              onExtended={() => void load()}
              onPurchased={() => {
                setShowPassSheet(false);
                void load();
              }}
            />
          )}
        </main>
      );
    }

    // S2 — 무료 인트로 소진 + 패스 없음: 히스토리(읽기전용) + 패스 패널이 주 CTA
    if (!hasPass) {
```

기존 S2 블록의 나머지(히스토리 + "패스 시작하기" 버튼 + PassSheet)는 그대로 둔다. 안내 문구(218-220행)만 소진 상태에 맞게 교체:

```tsx
                {messages.length === 0
                  ? "아직 별콩이랑 나눈 얘기가 없어 — 패스를 시작하면 바로 이야기할 수 있어."
                  : "무료 대화를 다 썼어 — 패스를 켜면 이 대화 그대로 이어갈 수 있어"}
```

주의: 스레드에 대화가 있고 패스가 만료된 기존 유저는 `usedFreeTurns >= 3`이라 자동으로 기존 S2("패스가 만료됐어") 경로를 탄다. 만료 문구가 사라지지 않도록 삼항을 messages 유무가 아니라 아래처럼 분기해도 된다 — 단순하게 가려면 위 교체안 그대로(만료 유저도 같은 문구로 수렴, 의미 동일).

- [ ] **Step 3: 타입·빌드 검증**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 4: 로컬 플로우 검증 (dev Supabase)**

`npm run dev` → 브라우저 `localhost:3000/relationship`:
1. 신규 관계 등록 → 패스 구매 없이 입력창이 열리고 배너 "무료 첫 대화 1/3턴" 노출
2. 3회 발화 후 4번째 전송 시 402 → "패스가 필요해" 에러 + 화면이 패스 CTA(S2)로 전환
3. 마지막(3번째) 응답이 정리+패스 초대 톤으로 닫히는지 (가격 언급 없어야 함)
Expected: 세 항목 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add app/relationship/page.tsx
git commit -m "feat(relationship): S2 무료 인트로 — 패스 전 3턴 입력 개방 + 잔여 배너 (P0-1 클라)"
```

---

### Task 3: P0-2 — 타로 리딩 turn-1 출구 칩 (wrapMode 게이트 제거)

**Files:**
- Modify: `app/tarot/reading/page.tsx:644-653`

- [ ] **Step 1: exitEligible 게이트 제거**

기존(644-653행):

```ts
    } else if (stage === 2) {
      // W3 출구 — 수렴 이후(또는 RECO 노출 후)에만. 초반 증발 유도 방지.
      idleStageRef.current = 3; // 종료 — 더는 무장하지 않음
      const exitEligible =
        wrapModeRef.current !== "free" || Object.keys(recoAttach).length > 0;
      if (exitEligible) {
        pushNudge(EXIT_NUDGE);
        setExitOffer(true);
      }
    }
```

를 아래로 교체:

```ts
    } else if (stage === 2) {
      // 출구 칩 — 첫 턴부터 노출 (2026-07-26 P0-2: 1턴 만족 이탈도 결과 화면을 경유하도록
      // wrapMode 게이트 제거. 근거: 결과 미도달 47.4% + 1턴 시점 마무리 안내 0)
      idleStageRef.current = 3; // 종료 — 더는 무장하지 않음
      pushNudge(EXIT_NUDGE);
      setExitOffer(true);
    }
```

`wrapModeRef`는 X-Wrap-Mode 저장부(573행)에서 계속 쓰이므로 선언은 그대로 둔다. `wrapModeRef` 사용처가 이 게이트뿐이었다면 — 573행 저장 로직과 139행 선언까지 함께 제거해도 되지만, 다른 참조가 있는지 `grep -n "wrapModeRef" app/tarot/reading/page.tsx`로 확인 후 참조가 이 두 곳(저장/게이트)뿐이면 선언+저장도 제거(이번 변경으로 고아가 된 코드).

- [ ] **Step 2: 타입 검증 + 로컬 확인**

Run: `npx tsc --noEmit` → 에러 0.
로컬: 타로 상담 1턴 진행 후 아이들 대기 → "✨ 결과 카드 보기" 출구 칩이 첫 턴에도 노출.

- [ ] **Step 3: Commit**

```bash
git add app/tarot/reading/page.tsx
git commit -m "feat(tarot): turn-1 출구 칩 — wrapMode free 게이트 제거 (P0-2)"
```

---

### Task 4: P1 — 페르소나 일괄 수정 (회피구 조건부 범위 답 · premium-depth 구조 강제 · CARD 마커)

**Files:**
- Modify: `data/persona/byeolkong_core.md` (§"언제·될까·얼마나")
- Modify: `data/persona/byeolkong_tarot.md` (마커 규칙·카드 해석 골격·톤 예시)
- Modify: `lib/claude.ts:560` (타로 첫 턴 가이드)

- [ ] **Step 1 (P1-3a): core.md §"언제·될까·얼마나"에 조건부 범위 답 규칙 추가**

`3. **한계는 꼬리에만, 대화당 1회**` 항목 바로 아래에 추가:

```markdown
4. **시점 질문은 조건부 범위로 답해** — "몰라"도 "정확히 몇월 며칠"도 아닌, 판의 흐름을 근거로 한 범위+조건: "이 결이 이어지면 이르면 ~, 늦어도 ~쯤엔 움직임이 보일 흐름이야. 특히 네가 ~하면 더 당겨져." **부정 절("~까지 찍어주긴 어렵지만", "~날짜를 주진 않지만")을 답 앞뒤에 붙이지 마** — 범위와 조건만으로 답은 충분해.
```

- [ ] **Step 2 (P1-3b): tarot.md 톤 예시의 회피 절 제거**

기존(126행):

```markdown
✅ "펼친 카드 결로 보면 ~쪽이야. 카드가 날짜를 도장 찍듯 주진 않지만, 흐름으로는 ~ 무렵이 열려 있어." (방향 먼저, 판의 한계는 방향 뒤 꼬리에 딱 한 번만)
```

를 아래로 교체 (✅ 예시가 회피 절을 정당화하던 누수 봉합):

```markdown
✅ "펼친 카드 결로 보면 ~쪽이야. 흐름으로는 ~ 무렵이 열려 있고, 특히 네가 ~하면 더 당겨질 결이야." (방향 먼저 + 조건부 범위 — "카드가 날짜를 찍어주진 않는다" 류 부정 절은 붙이지 않는다)
```

- [ ] **Step 3 (P1-5): tarot.md 마커 규칙에 "마커보다 먼저 카드 얘기 금지" 추가**

`## 타로 풀이 출력 구조 ([CARD:n] 마커 필수)` 섹션의 "프론트엔드가 이 마커로 …" 문단(24행) 바로 아래에 추가:

```markdown
**마커보다 먼저 그 카드 얘기 금지**: 어떤 카드든 이름·해석의 첫 단어보다 [CARD:n]이 먼저 나와야 해. 도입 훅에서는 개별 카드 이름을 언급하지 말고 펼쳐진 판 전체의 결만 짚어 — 개별 카드 이야기는 전부 해당 마커 뒤에서 시작해.
```

- [ ] **Step 4 (P1-4): tarot.md 카드 해석에 5장+ 라벨 골격 강제**

`### 각 카드 해석` 섹션에서, "프리미엄 카드당 문장 배분 (합쳐서 5~6문장):" 목록(1·2·3번 항목)과 "+ 마지막에 **종합 파트**…" 문단 **사이**에 추가:

```markdown
**5장 이상 스프레드는 카드마다 아래 3줄 라벨 골격을 그대로 출력해** — 라벨 뒤에 문장을 채우는 방식이라 구조가 분량을 보장해. 라벨을 건너뛰거나 합치지 마 (세 라벨이 카드마다 다 있어야 해):

```
[CARD:n]
🃏 카드가 말하는 것: (2문장 — 이름 + 도상 요소 1개 + 정/역 메시지)
💫 너의 상황에서는: (2~3문장 — 포지션×네 고민 연결, 가장 두껍게)
🔗 흐름 연결: (1문장 — 앞 카드와의 이음새. 첫 카드는 도입 훅과의 이음새)
```

쓰리카드(3장)는 골격 없이 산문으로 하되 문장 배분(2 / 2~3 / 1)은 동일하게 지켜.
```

- [ ] **Step 5 (P1-5 보강): lib/claude.ts 첫 턴 가이드에 마커 선행 규칙 한 줄**

560행 첫 턴 가이드 문자열 끝(`마무리 3택 중 하나.` 뒤)에 이어 붙임:

```
 카드 이름은 반드시 해당 [CARD:n] 마커 뒤에서 처음 언급해 — 훅에서 개별 카드명 금지. 5장 이상 스프레드는 "각 카드 해석"의 3줄 라벨 골격(🃏/💫/🔗)을 카드마다 그대로.
```

- [ ] **Step 6: 검증 — dev 서버 재시작 후 실대화**

⚠️ 페르소나는 모듈 캐시(`_cachedTarotPersona` 등) — **dev 서버 재시작 필수**.
`npm run dev` 재시작 → 로컬에서 5장 스프레드(관계/속마음/재회) 첫 풀이 1회:
1. 카드마다 `[CARD:n]` → 🃏/💫/🔗 3라벨 골격이 나오는지
2. 훅 단락에 카드 이름이 먼저 튀어나오지 않는지 (마커 오배치 재현 안 됨)
3. "언제쯤"류 질문 1회 던져 회피 절 없이 조건부 범위 답이 오는지
Expected: 3항목 통과. (QA 하네스 보유 시나리오가 있으면 `npm run qa`로 회귀 병행 — [[qa-harness-usage]])

- [ ] **Step 7: Commit**

```bash
git add data/persona/byeolkong_core.md data/persona/byeolkong_tarot.md lib/claude.ts
git commit -m "feat(persona): 조건부 범위 답 강제 + premium 5장+ 카드별 3라벨 골격 + CARD 마커 선행 규칙 (P1)"
```

---

### Task 5: P2-6 — next_reco 중단 (haiku 태깅 off + 결과 추천 카드 제거)

인챗 칩(clarifier·extend)과 결과 화면 "이어가기"(ContinuationModal)는 **유지** — 제거 대상은 next_reco 저장(마커+haiku)과 결과 화면 RecoCard 뿐.

**Files:**
- Modify: `app/api/consultations/tarot/chat/route.ts` (16행 import, 315-377행 reco 후처리 블록)
- Modify: `app/api/consultations/saju/chat/route.ts` (28행 import, 326-388행 reco 후처리 블록)
- Modify: `app/tarot/result/page.tsx` (13행 import, 46행 타입 필드, 318-326행 렌더)
- Modify: `app/(consultations)/saju/result/page.tsx` (13행 import, 41행 타입 필드, 221-229행 렌더)
- Delete: `components/reco/RecoCard.tsx`, `lib/reco.ts`

- [ ] **Step 1: 두 chat 라우트에서 reco 후처리 블록 삭제**

각 라우트에서 `// reco 후처리 — sensitive 턴이면 스킵 (위기 대화엔 추천 없음)` 주석으로 시작하는 if 블록 전체(마커 parse → next_reco UPDATE → haiku 태깅 fire-and-forget까지)를 삭제. 삭제 후 import 줄 `import { parseRecoMarker, tagNextRecoAsync, INCHAT_ONLY_PRODUCTS } from "@/lib/reco";`도 제거.

주의: 블록 안의 `recordSensitiveAlert`/`has_sensitive` UPDATE는 reco 블록 **밖**의 별도 로직 — 건드리지 말 것 (tarot 303행, saju 314행 부근).

- [ ] **Step 2: 결과 페이지 2곳에서 RecoCard 제거**

각 result 페이지에서:
- `import RecoCard from "@/components/reco/RecoCard";` 삭제
- 로컬 reading 타입의 `nextReco: NextReco | null;` 필드와 `import type { NextReco } from "@/lib/reco-utils";` 삭제 (`stripRecoMarkers` import는 유지 — 본문 마커 제거에 계속 사용)
- 렌더 블록 삭제:

```tsx
      {/* ① 추천 카드 — next_reco 있을 때만 */}
      {reading.nextReco && (
        <RecoCard ... />
      )}
```

(reading 객체를 조립하는 곳에서 `nextReco: ...` 매핑 라인이 있으면 함께 삭제.)

- [ ] **Step 3: 고아 파일 삭제 + 참조 검증**

```bash
git rm components/reco/RecoCard.tsx lib/reco.ts
grep -rn "from \"@/lib/reco\"" app lib components
grep -rn "RecoCard" app components
```

Expected: 두 grep 모두 0건 (`@/lib/reco-utils` 참조는 남는 게 정상 — reading 페이지 인챗 칩·admin이 사용). `app/api/readings/[id]/route.ts`의 next_reco 반환과 admin 패널(UpsellPanel·admin readings)은 과거 데이터 열람용으로 유지.

- [ ] **Step 4: 타입 검증**

Run: `npx tsc --noEmit` → 에러 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reco): next_reco 중단 — haiku 태깅 off + 결과 추천 카드 제거 (인챗 칩·이어가기 유지, P2-6)"
```

---

### Task 6: P2-7 — star_150·star_300 진열 제거 (죽은 SKU)

**Files:**
- Modify: `lib/constants.ts`
- Modify: `app/shop/page.tsx`, `components/upsell/RechargeSheet.tsx` (목록 렌더)
- Modify: `app/api/payment/ready/route.ts:23-26` (신규 구매 차단)

- [ ] **Step 1: StarPackage에 active 플래그**

`lib/constants.ts`:

```ts
export interface StarPackage {
  id: string;
  stars: number;
  price: number;
  label: string;
  /** false = 진열·신규 구매 중단 (판매 0 SKU — 2026-07-26 스펙 §4 P2-7). 결제 이력 표시는 유지. */
  active?: boolean;
}

export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_30", stars: 30, price: 2800, label: "30별" },
  { id: "star_70", stars: 70, price: 5900, label: "70별" },
  { id: "star_150", stars: 150, price: 11000, label: "150별", active: false },
  { id: "star_300", stars: 300, price: 19900, label: "300별", active: false },
];
```

- [ ] **Step 2: 진열 2곳 필터**

`app/shop/page.tsx`와 `components/upsell/RechargeSheet.tsx`에서 패키지 목록을 렌더하는 `STAR_PACKAGES.map(` 지점을 찾아(각 파일 `grep -n "STAR_PACKAGES.map"`) 아래처럼 필터 상수를 거쳐 렌더:

```ts
const DISPLAY_PACKAGES = STAR_PACKAGES.filter((p) => p.active !== false);
```

→ 해당 `map`의 대상만 `DISPLAY_PACKAGES`로 교체. `STAR_PACKAGES[0]` 기반 `BASE_PER_STAR`(shop 43행)와 `find` 조회는 그대로 둔다 (star_10은 active라 영향 없음).

- [ ] **Step 3: ready 라우트에서 신규 구매 차단**

`app/api/payment/ready/route.ts` 24행 검증을:

```ts
    const pkg = STAR_PACKAGES.find((p) => p.id === packageType);
    if (!pkg || pkg.active === false || pkg.stars !== stars || pkg.price !== amount) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }
```

(confirm 라우트는 ready가 만든 orderId 없이는 진행 불가라 별도 수정 불필요.)

- [ ] **Step 4: 검증 + Commit**

`npx tsc --noEmit` → 에러 0. 로컬 `/shop`에서 150·300 카드 미노출 확인.

```bash
git add lib/constants.ts app/shop/page.tsx components/upsell/RechargeSheet.tsx app/api/payment/ready/route.ts
git commit -m "feat(shop): star_150·star_300 진열 제거 + 신규 구매 차단 (P2-7)"
```

---

### Task 7: P2-8a — 탈퇴 시 유입 출처 스냅샷 (additive 마이그레이션 + withdraw 복사)

**Files:**
- Create: `supabase/migrations/20260726000000_withdrawals_acquisition_snapshot.sql`
- Modify: `app/api/auth/withdraw/route.ts:73-89`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 20260726000000_withdrawals_acquisition_snapshot.sql — 탈퇴 시 유입 출처 스냅샷 (additive)
-- 배경: users CASCADE 로 user_acquisition 이 함께 삭제돼 소재별 탈퇴/코호트 계측이 소실
-- (2026-07-25 P&L §리스크 5). 탈퇴 직전 user_acquisition 을 복사해 append-only 원장에 보존.
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_source      TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_medium      TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_campaign    TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_content     TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_term        TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS landing_variant TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS referrer        TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS first_seen_at   TIMESTAMPTZ;
```

- [ ] **Step 2: withdraw 라우트에서 스냅샷 복사**

`app/api/auth/withdraw/route.ts`의 탈퇴 이력 기록 블록(75-89행)을 교체:

```ts
  if (userRow?.kakao_id) {
    const kakaoIdHash = createHash("sha256")
      .update(String(userRow.kakao_id))
      .digest("hex");
    // 유입 스냅샷 — users CASCADE 로 user_acquisition 이 사라지기 전에 복사 (소재별 탈퇴율 계측)
    const { data: acq } = await supabase
      .from("user_acquisition")
      .select(
        "utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_variant, referrer, first_seen_at"
      )
      .eq("user_id", userId)
      .maybeSingle();
    const { error: wErr } = await supabase
      .from("account_withdrawals")
      .insert({ kakao_id_hash: kakaoIdHash, ...(acq ?? {}) });
    if (wErr) {
      await logError(wErr, {
        route: "/api/auth/withdraw",
        userId,
        extra: { severity: "WITHDRAWAL_LOG_FAILED" },
      });
    }
  }
```

- [ ] **Step 3: 로컬 마이그레이션 replay 검증**

dev Supabase에 git push 시 자동 적용되므로, 이 시점엔 SQL 문법만 확인:
Run: `npx tsc --noEmit` (라우트 타입) — 에러 0. dev push 후 Supabase dev 브랜치 Workflow logs에서 마이그레이션 SUCCESS 확인.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260726000000_withdrawals_acquisition_snapshot.sql app/api/auth/withdraw/route.ts
git commit -m "feat(withdraw): 탈퇴 시 user_acquisition 스냅샷 보존 — additive 컬럼 8개 (P2-8a)"
```

---

### Task 8: P2-8b — landing_variant 독립 캡처 (utm_content 폴백 제거)

**Files:**
- Modify: `components/auth/AuthBootstrap.tsx:50-53`

- [ ] **Step 1: /start utm_content 폴백 제거**

기존:

```ts
    // 랜딩 종류: 전용 v 우선(어느 광고 랜딩이든), utm_content 는 레거시 /start 폴백.
    // (utm_content 는 이제 소재명 전용이라 v 없이 이걸 landing_variant 로 쓰면 오염)
    const lv = sp.get("v") ?? (pathname === "/start" ? sp.get("utm_content") : null);
```

를:

```ts
    // 랜딩 종류: 전용 v 파라미터만 (2026-07-26 P2-8b: /start utm_content 폴백 제거 —
    // utm_content 는 소재명 전용이라 폴백이 landing_variant 를 오염시킴. 현행 광고는 전부 v= 사용)
    const lv = sp.get("v");
```

`pathname`이 이 폴백에서만 쓰였는지 `grep -n "pathname" components/auth/AuthBootstrap.tsx`로 확인 — 다른 사용처가 없으면 선언·import도 함께 제거 (이번 변경의 고아).

- [ ] **Step 2: 검증 + Commit**

`npx tsc --noEmit` → 에러 0.

```bash
git add components/auth/AuthBootstrap.tsx
git commit -m "feat(analytics): landing_variant v 파라미터 독립 캡처 — /start utm_content 폴백 제거 (P2-8b)"
```

---

### Task 9: 통합 검증 + 배포 (= day 0)

**Files:** 없음 (검증·배포)

- [ ] **Step 1: 유닛 회귀 + 전체 빌드**

```bash
node --import tsx --test lib/analytics/traffic.test.ts lib/fortune/monthly-report.test.ts
npm run build
```

Expected: 테스트 전부 pass, 빌드 성공.

- [ ] **Step 2: 로컬 통합 플로우 (dev Supabase)**

`npm run dev` (⚠️ 재시작 상태에서 — 페르소나 캐시):
1. 우리 사이: 등록 → 무료 3턴 → 4턴째 402 → 패스 CTA (Task 2 Step 4 재확인)
2. 타로: 5장 스프레드 첫 풀이 골격 + turn-1 출구 칩 + 결과 화면에 RecoCard 없음 + "이어가기"는 있음
3. /shop: 3개 패키지만 진열
4. 마이페이지 탈퇴는 dev 계정으로 1회 실행 → Supabase dev `account_withdrawals`에 utm 컬럼 채워진 row 확인 (탈퇴 전 utm 쿠키로 가입한 테스트 계정 필요 — `localhost:3000/start?v=test&utm_source=meta`로 가입)

- [ ] **Step 3: dev push → dev 사이트 확인 → main fast-forward (사용자 확인 후)**

```bash
git push origin dev
# dev.byeolkongtalk.com 스모크 + Supabase dev Workflow logs SUCCESS 확인 후:
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

prod 배포 후: `/api/health` 200 → Supabase main Workflow logs에서 마이그레이션 SUCCESS → prod 실기기에서 우리 사이 무료 3턴 스모크. **이 prod 배포 시각 = 스펙 §5의 day 0.** 이후 사용자 액션: Meta 재편(§1) → day 2~3 rel 광고 ON.

---

## 완료 조건 (스펙 §4 매핑)

- [ ] P0-1 무료 3턴 (서버 게이트 + 마지막 턴 마무리 가이드 + 클라 개방) — Task 1·2
- [ ] P0-2 turn-1 출구 칩 — Task 3
- [ ] P1-3 회피 상용구·조건부 범위 답 / P1-4 premium 골격 / P1-5 CARD 마커 — Task 4
- [ ] P2-6 reco 중단(인챗 칩·이어가기 보존) — Task 5
- [ ] P2-7 죽은 SKU 진열 제거 — Task 6
- [ ] P2-8 utm 스냅샷 + landing_variant 분리 — Task 7·8
- [ ] prod 배포 + day 0 기준점 확정 — Task 9
