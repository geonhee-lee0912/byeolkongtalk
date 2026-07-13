# 전환 순간 만들기 — C2 (추천 인프라) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 별콩이가 크로스셀/추가 리딩을 언급하는 순간을 [RECO:] 마커로 구조화 → 인챗 인라인 카드(확인 모달 → A안: 그레이스풀 종료 후 결과 스킵 직행) + 결과 화면 추천 카드(마커 1순위, haiku 태깅 2순위) + cross-type fresh 이어가기.

**Architecture:** 마커는 [CARD:n]과 동일 패턴 (페르소나 방출 → 프론트 파싱·strip → 렌더). next_reco JSONB에 저장 (chat 라우트 후처리, detectSensitiveAsync 미러). cross-type은 기존 tarot-fresh의 sessionStorage continuation 마커 패턴을 사주 진입에도 적용.

**Tech Stack:** Next.js 16 App Router, Supabase 마이그레이션 1개, Claude haiku (태깅), 기존 continuation 인프라 재사용.

**Spec:** [2026-07-13-conversion-moment-design.md](../specs/2026-07-13-conversion-moment-design.md) 변경 ③-b·⑤ + 화면 이동·복귀 전략 표.

---

## 계약 (모든 태스크 공통 참조)

**RECO 제품 enum** (`lib/reco.ts` 단일 정의):
```ts
export type RecoProduct =
  | "saju:good_days"      // 시기·날짜 → 사주 좋은 날
  | "saju:nature"         // 본질·방향
  | "saju:choice"         // 선택 갈림길
  | "tarot:relationship_5" // 상대 마음 → 타로 관계 스프레드
  | "continue";           // 같은 고민 이어가기 (기본)
```

**마커 형식**: `[RECO:saju:good_days]` — assistant 응답 내 단독 줄. 대화당 최대 1개 (페르소나 규칙).

**next_reco JSONB**: `{ product: RecoProduct, question: string|null, hook: string|null, source: "marker"|"haiku", created_at: string }`

**우선순위**: 마커 등장 즉시 저장(source=marker, 덮어쓰기 없음) → [END] 시점에 next_reco 없으면 haiku 태깅(source=haiku) → 둘 다 없으면 결과 화면은 기존 그대로. `has_sensitive=true`면 둘 다 생략.

**A안 직행 대상**: cross-type 제품(saju:*, tarot:*)만. `continue`는 인라인 카드 없이 결과 화면 카드로만 (기존 이어가기 흐름).

---

### Task 1: 마이그레이션 — readings.next_reco

**Files:** Create: `supabase/migrations/20260713000000_readings_next_reco.sql`

- [ ] **Step 1: 파일 작성**
```sql
-- 20260713000000_readings_next_reco.sql
-- 결과 화면 "다음 상담 추천" — [RECO:] 마커(1순위) 또는 haiku 태깅(2순위) 결과.
-- { product, question, hook, source: 'marker'|'haiku', created_at }
ALTER TABLE readings ADD COLUMN IF NOT EXISTS next_reco JSONB;
```
- [ ] **Step 2: Commit** — `git add supabase/migrations/20260713000000_readings_next_reco.sql && git commit -m "feat(db): readings.next_reco JSONB — 다음 상담 추천 (C2)"`
- 참고: dev push 시 Supabase Git 연동이 자동 적용. push 후 Branches → dev Workflow logs SUCCESS 확인 (Task 9에서).

### Task 2: `lib/reco.ts` — enum·마커 파서·훅 템플릿·haiku 태깅

**Files:** Create: `lib/reco.ts`

- [ ] **Step 1: 모듈 작성** — 아래 전체:
```ts
// lib/reco.ts — 다음 상담 추천: [RECO:] 마커 파싱 + haiku 태깅 + 표시 메타.
import Anthropic from "@anthropic-ai/sdk";

export type RecoProduct =
  | "saju:good_days"
  | "saju:nature"
  | "saju:choice"
  | "tarot:relationship_5"
  | "continue";

export const RECO_PRODUCTS: RecoProduct[] = [
  "saju:good_days",
  "saju:nature",
  "saju:choice",
  "tarot:relationship_5",
  "continue",
];

export interface NextReco {
  product: RecoProduct;
  question: string | null;
  hook: string | null;
  source: "marker" | "haiku";
  created_at: string;
}

/** 응답 본문 내 [RECO:...] 마커 — 표시 전 반드시 strip. */
export const RECO_MARKER_REGEX = /\[RECO:([a-z0-9_:]+)\]/gi;

export function stripRecoMarkers(text: string): string {
  return text.replace(RECO_MARKER_REGEX, "").replace(/\n{3,}/g, "\n\n");
}

/** 첫 유효 마커의 product 반환 (enum 밖 값은 무시). */
export function parseRecoMarker(text: string): RecoProduct | null {
  for (const m of text.matchAll(RECO_MARKER_REGEX)) {
    const v = m[1].toLowerCase();
    if ((RECO_PRODUCTS as string[]).includes(v)) return v as RecoProduct;
  }
  return null;
}

/** 결과 카드 표시 메타 — 라벨·기본 훅 카피(마커 소스용)·진입 대상. */
export const RECO_DISPLAY: Record<
  RecoProduct,
  { label: string; defaultHook: string; target: "saju" | "tarot" | "continue"; sajuProduct?: string; spreadType?: string }
> = {
  "saju:good_days": {
    label: "사주 · 좋은 날",
    defaultHook: "궁금했던 '그 날'의 결 — 앞으로 30일 흐름은 좋은 날 상담이 짚어줄 수 있어",
    target: "saju",
    sajuProduct: "good_days",
  },
  "saju:nature": {
    label: "사주 · 타고난 결",
    defaultHook: "이 고민의 뿌리 — 타고난 흐름은 사주가 더 깊게 봐줄 수 있어",
    target: "saju",
    sajuProduct: "nature",
  },
  "saju:choice": {
    label: "사주 · 선택의 갈림길",
    defaultHook: "그 선택의 결 — 갈림길은 사주 선택 상담이 같이 봐줄 수 있어",
    target: "saju",
    sajuProduct: "choice",
  },
  "tarot:relationship_5": {
    label: "타로 · 관계 스프레드",
    defaultHook: "그 사람 마음의 결 — 두 사람 자리를 따로 펼치는 관계 카드가 비춰줄 수 있어",
    target: "tarot",
    spreadType: "relationship_5",
  },
  continue: {
    label: "이 고민 이어가기",
    defaultHook: "오늘 못다 푼 매듭 — 지난 맥락 그대로 이어서 볼 수 있어",
    target: "continue",
  },
};

const TAG_SCHEMA = `너는 상담 대화를 읽고 "다음 상담 추천"을 JSON 한 개로만 답하는 분류기다.
출력 형식: {"unresolvedQuestion": string|null, "product": string, "hook": string}
- unresolvedQuestion: 유저가 끝내 답을 못 받은 핵심 질문 (없으면 null)
- product: 다음 중 하나 — "saju:good_days"(날짜·시기 갈증) / "saju:nature"(본질·방향) / "saju:choice"(선택 갈림길) / "tarot:relationship_5"(상대방 속마음) / "continue"(위에 해당 없음, 같은 고민 계속)
- hook: 유저의 미해결 질문을 짚는 한 문장 초대 카피 (반말, 40자 이내, 가격·별 언급 금지)
JSON 외 텍스트 금지.`;

/** [END] 후 fire-and-forget — next_reco 없을 때만 호출할 것. 실패 시 null (조용히). */
export async function tagNextRecoAsync(
  conversationText: string,
  consultationType: "saju" | "tarot"
): Promise<Omit<NextReco, "created_at" | "source"> | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: TAG_SCHEMA,
      messages: [
        {
          role: "user",
          content: `[상담 종류: ${consultationType}]\n${conversationText.slice(-4000)}`,
        },
      ],
    });
    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const product = (RECO_PRODUCTS as string[]).includes(json.product)
      ? (json.product as RecoProduct)
      : null;
    if (!product) return null;
    return {
      product,
      question: typeof json.unresolvedQuestion === "string" ? json.unresolvedQuestion.slice(0, 120) : null,
      hook: typeof json.hook === "string" ? json.hook.slice(0, 80) : null,
    };
  } catch (e) {
    console.warn("[reco] 태깅 실패 (무시):", e instanceof Error ? e.message : e);
    return null;
  }
}
```
- [ ] **Step 2: 빌드** — `npm run build` 에러 0
- [ ] **Step 3: Commit** — `feat(reco): lib/reco — 마커 파서·표시 메타·haiku 태깅 (C2)`

### Task 3: 페르소나 — [RECO:] 마커 방출 지시 (2파일)

**Files:** Modify: `data/persona/byeolkong_tarot.md`, `data/persona/byeolkong.md`

- [ ] **Step 1 (타로): 크로스셀 문단에 마커 지시** — "달력 수준의 시점을 거듭 파고들면" 문단 끝(`별·가격·결제는 절대 언급 금지.`)에 이어서:
```
이 안내를 말하는 **바로 그 응답의 맨 끝에 `[RECO:saju:good_days]` 마커를 단독 줄로** 붙여 (화면에선 자동으로 숨겨지고 안내 카드가 떠). 마커도 대화당 1번만.
```
- [ ] **Step 2 (타로): "더 보고 싶다" 섹션 경로 안내에 마커 지시** — "같은 고민을 더 깊이" 불릿 뒤에:
```
  - 위 두 경로 중 하나를 안내한 그 응답 맨 끝에 `[RECO:continue]` 마커를 단독 줄로 붙여 (같은 고민 더 깊이일 때만. 새 질문·다른 주제 안내면 마커 없음).
```
- [ ] **Step 3 (사주): 동일 2곳** — 크로스셀("상대방 마음을 거듭 파고들면") 문단 끝에 `[RECO:tarot:relationship_5]` 마커 지시, "더 보고 싶다" 섹션에 `[RECO:continue]` 지시 (문구는 Step 1·2와 동일 취지, 도메인 어휘만).
- [ ] **Step 4: Commit** — `feat(persona): [RECO:] 마커 방출 지시 (C2)`
- 참고: prompt_version 갱신은 Task 9에서 일괄.

### Task 4: chat 라우트 후처리 — 마커 저장 + haiku 태깅 (tarot·saju)

**Files:** Modify: `app/api/consultations/tarot/chat/route.ts` (~행 209-263), `app/api/consultations/saju/chat/route.ts` (동일 위치)

- [ ] **Step 1: import** — `import { parseRecoMarker, tagNextRecoAsync } from "@/lib/reco";`
- [ ] **Step 2: 스트림 완료 후처리 삽입** (messages INSERT 이후, sensitive 처리와 나란히 — 두 라우트 동일 로직):
```ts
// C2: 다음 상담 추천 — 마커 1순위, [END]+미태깅 시 haiku 2순위. has_sensitive면 생략.
if (!sensitiveSync) {
  const recoFromMarker = parseRecoMarker(assistantText);
  if (recoFromMarker) {
    void db
      .from("readings")
      .update({
        next_reco: {
          product: recoFromMarker,
          question: null,
          hook: null,
          source: "marker",
          created_at: new Date().toISOString(),
        },
      })
      .eq("id", readingId)
      .is("next_reco", null) // 덮어쓰기 방지
      .then(() => {});
  } else if (hasEnd) {
    void (async () => {
      const { data: r } = await db.from("readings").select("next_reco, has_sensitive").eq("id", readingId).single();
      if (r?.next_reco || r?.has_sensitive) return;
      const convo = allMessagesText; // user/assistant 라벨 포함 최근 대화 문자열 — 라우트의 기존 messages 변수로 구성
      const tag = await tagNextRecoAsync(convo, "tarot"); // saju 라우트는 "saju"
      if (!tag) return;
      await db
        .from("readings")
        .update({ next_reco: { ...tag, source: "haiku", created_at: new Date().toISOString() } })
        .eq("id", readingId)
        .is("next_reco", null);
    })();
  }
}
```
  - 구현 시 라우트의 실제 변수명(`assistantText`, `hasEnd`, DB 클라이언트, messages 배열)에 맞춰 조정. `.is("next_reco", null)` 조건이 마커 우선순위 보장의 핵심.
- [ ] **Step 3: 빌드 + Commit** — `feat(chat): [RECO:] 마커→next_reco 저장 + END 시 haiku 태깅 (C2)`

### Task 5: 표시 텍스트에서 마커 strip (전 표면)

**Files:** Modify: `app/tarot/reading/page.tsx`(parseIntoBubbles + END 처리부), `app/(consultations)/saju/reading/page.tsx`, `app/tarot/result/page.tsx`(cleanContent), `app/(consultations)/saju/result/page.tsx`, `lib/saju/closing.ts`(한마디 추출)

- [ ] **Step 1**: 각 파일에서 [CARD:n]/[END]를 지우는 지점 바로 옆에 `stripRecoMarkers()` 적용 (또는 기존 정규식 나란히 `RECO_MARKER_REGEX` 치환). streaming 중 미완성 마커(`[RECO:saj` 등)는 타로 리딩 페이지의 `TRAILING_PARTIAL_MARKER` 패턴에 RECO도 포함되게 확장.
- [ ] **Step 2: 빌드 + Commit** — `feat(ui): [RECO:] 마커 표시 strip 전 표면 (C2)`

### Task 6: 결과 화면 추천 카드

**Files:** Create: `components/reco/RecoCard.tsx` / Modify: `app/api/readings/[id]/route.ts`(응답에 next_reco 포함), `app/tarot/result/page.tsx`, `app/(consultations)/saju/result/page.tsx`

- [ ] **Step 1: API 응답 확장** — reading select에 `next_reco` 추가, 응답 JSON에 `nextReco` 필드.
- [ ] **Step 2: RecoCard** — props `{ reco: NextReco, readingId: string, hasSensitive: boolean, onContinue: () => void }`:
  - `hasSensitive`면 null 반환.
  - `product === "continue"`: 훅 카피(reco.hook ?? defaultHook) + 기존 이어가기 모달 열기(onContinue).
  - cross-type: 훅 카피 + `RECO_DISPLAY` 라벨 버튼 → 클릭 시 `sessionStorage`에 ①`byeolkong:continuation = { parentId: readingId, mode: "fresh" }` ②`byeolkong:pending_consultation = { emotion, concern: reading.question, type: target, sajuProduct?/spreadType? }` 저장 → `router.push(target === "saju" ? "/saju" : "/tarot")`.
  - 스타일: 기존 RechargeBlock/ResultUpsell 톤(cream-warm 카드 + gold 보더) 따름.
- [ ] **Step 3: 결과 페이지 배치** — RechargeBlock 바로 위. `nextReco` 없으면 렌더 안 함(기존 화면 그대로).
- [ ] **Step 4: 빌드 + Commit** — `feat(result): 다음 상담 추천 카드 (C2)`

### Task 7: 인챗 인라인 카드 + 확인 모달 + A안 직행 (tarot·saju 리딩 페이지)

**Files:** Create: `components/reco/RecoInlineCard.tsx`, `components/reco/RecoConfirmModal.tsx` / Modify: 두 리딩 페이지

- [ ] **Step 1: parseIntoBubbles 확장** — [RECO:product] 감지 시 해당 assistant 메시지에 `reco: RecoProduct` 부착 (텍스트에선 strip — Task 5와 연계). `continue` product는 인라인 카드 제외 (결과 카드 전용).
- [ ] **Step 2: RecoInlineCard** — 말풍선 아래 소형 카드 (gold 보더): `RECO_DISPLAY[product].label` + "지난 고민을 기억한 채 이어져요". 탭 → RecoConfirmModal. 대화가 이어져도 그 메시지에 앵커된 채 유지 (별도 dismiss 없음).
- [ ] **Step 3: RecoConfirmModal** — 포털(ContinuationModal 패턴): "이 대화를 마무리하고 넘어갈까? 남은 대화가 있다면 계속해도 좋아요" / [아니, 대화 더 할래](닫기만) / [마무리하고 넘어가기].
- [ ] **Step 4: A안 직행 wiring** — [마무리하고 넘어가기] 시:
  1. `pendingRecoJumpRef.current = product` 저장
  2. 기존 `handleFinish()`(forceEnd) 호출 → 그레이스풀 작별 스트림
  3. `finishMessage()`에서 [END] 감지 시 `pendingRecoJumpRef` 있으면: sessionStorage 세팅(Task 6 Step 2와 동일 2키) 후 `router.replace(target)` — 결과 화면 스킵. 없으면 기존 동작.
- [ ] **Step 5: 빌드 + Commit** — `feat(reading): 인챗 추천 카드 + 확인 모달 + 종료 후 직행 (C2)`

### Task 8: cross-type fresh 이어가기 — 사주 진입이 continuation 마커 소비

**Files:** Modify: `app/(consultations)/saju/page.tsx`(pending 소비부 ~행 33-96), `app/api/readings/route.ts`(POST에 previousReadingId·continuationMode 수용), 필요시 saju chat 라우트(continuation 컨텍스트 로드 — tarot-fresh 패턴 참조)

- [ ] **Step 1**: tarot-fresh의 `byeolkong:continuation` 마커 소비 흐름을 정독 (draw 흐름 어디서 마커 읽고 POST에 어떻게 싣는지) → 동일 패턴을 `/saju` 진입 → `/api/readings` POST에 적용: body에 `previousReadingId`, `continuationMode:"fresh"` 포함 시 readings INSERT에 저장 (**부모 소유권 검증**: parent.user_id === 세션 user).
- [ ] **Step 2**: saju chat 라우트가 previous_reading_id 있는 reading에서 부모 요약(prevQuestion·prevClosing)을 로드해 `ctx.continuation`으로 전달하는지 확인 — tarot 쪽 로직 미러 (이미 있으면 무변경).
- [ ] **Step 3**: 역방향(사주→타로 relationship_5)은 기존 tarot-fresh 마커 흐름 그대로 (draw가 이미 소비) — pending_consultation의 spreadType 프리셀렉트만 확인.
- [ ] **Step 4: 빌드 + Commit** — `feat(continuation): cross-type fresh — 사주 진입 continuation 마커 소비 (C2)`

### Task 9: prompt_version + QA judge 루브릭 + 검증 런

**Files:** Modify: `lib/prompt-version.ts`, `qa/evaluate/judge.ts`

- [ ] **Step 1: prompt_version** → `2026-07-13-conversion-c2` (히스토리 주석 추가).
- [ ] **Step 2: judge 루브릭 — 마무리 적절성에 수락 예외**: 7번 차원 텍스트에 추가: `(예외: 사용자가 별콩이가 안내한 다른 상담/이어가기를 수락한 직후("그거 볼래", "예약할게" 류)의 따뜻한 한두 문장 + [END]는 위반이 아니다 — 설계된 전환이다.)`
- [ ] **Step 3: QA 런** (dev 서버 **새로 시작** — 페르소나 모듈 캐시 주의):
  - `npm run qa -- --case=timing_push` → 트랜스크립트에서 [RECO:saju:good_days] 마커 방출 확인 + dev DB `readings.next_reco` 채워졌는지(source=marker) 확인
  - `npm run qa -- --case=more_cards` → [RECO:continue] 방출(같은 고민 심화 안내 시) 관찰
  - `npm run qa -- --case=happy_path --product=tarot:three_card` → 크로스셀 없는 정상 대화에서 [END] 후 haiku 태깅이 next_reco 채우는지 (source=haiku)
- [ ] **Step 4: Commit** — `chore(prompt): c2 스탬프 + judge 수락 예외`

### Task 10: 빌드 + dev push + e2e 핸드오프

- [ ] `npm run build` 에러 0 → `git push origin dev` → Supabase dev Workflow logs에서 마이그레이션 SUCCESS 확인 → dev 브라우저 e2e: 타로 상담→날짜 압박→인라인 카드→[마무리하고 넘어가기]→사주 good_days 직행→부모 맥락 인지 확인 / 자연 종료→결과 화면 추천 카드→클릭 경로.

---

## Self-Review 체크
- Spec 변경 ③-b(마커·인라인 카드·모달·A안) = Task 3·7 / ⑤(태깅·저장·결과 카드·cross-type) = Task 1·2·4·6·8 / judge 예외·prompt_version = Task 9. 누락: 없음. C3 항목(clarifier·연장·충전 시트) 미포함 — 의도.
- 마커 strip 표면: 리딩(스트리밍 포함)·결과·한마디 추출 커버 (Task 5). OG 이미지는 한마디 추출(closing) 경유라 자동 커버.
- 우선순위 보장: `.is("next_reco", null)` 이중 적용 (Task 4).
