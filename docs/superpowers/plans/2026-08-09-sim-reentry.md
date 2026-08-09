# 시뮬 재진입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 보관함 시뮬 카드 클릭 시 그 판으로 진입 — 진행 중=재개(무차감), 완료=재열람(대화 전체 read-only + 저장 디브리핑).

**Architecture:** 신규 GET `/api/relationship/sim?id=`가 판 상태(phase·전사·디브리핑)를 반환. 시뮬 페이지가 `?sim=`이면 이걸 로드해 phase로 분기 렌더. `NightStage`/`SimDebrief`는 프리로드 prop 추가. 프레임 고지는 `buildSimFrame` 공유 헬퍼로 결정적 재구성. 새 판 생성(POST `/sim`)은 절대 안 부름 → 무차감.

**Tech Stack:** Next 16 App Router · React 19 · TS strict. 기존 시뮬 엔진(chat 라우트·컴포넌트) 재사용.

**검증:** 컴포넌트 테스트 러너 없음 → `npx tsc --noEmit`(태스크별) + `npm run build`(권위) + 브라우저 E2E(dev, 쿠키 세션 주입). 커밋은 사용자 승인 후(현재 스펙·구현은 나중에 한번에 push).

**스펙:** `docs/superpowers/specs/2026-08-09-sim-reentry-design.md`

---

## File Structure

- **Modify** `lib/relationship/sim.ts` — `buildSimFrame` 헬퍼 추가.
- **Modify** `app/api/relationship/sim/route.ts` — POST가 헬퍼 사용 + 신규 `GET`.
- **Modify** `components/relationship/sim/NightStage.tsx` — `initialMessages`·`readOnly`.
- **Modify** `components/relationship/sim/SimDebrief.tsx` — `initialDebrief`·`initialSendMessage` 프리로드.
- **Modify** `app/relationship/sim/page.tsx` — `?sim=` 로드 경로 + 분기 렌더.
- **Modify** `app/readings/page.tsx` — `renderSimCard` href.

의존 순서: sim.ts → route.ts(GET) → NightStage ∥ SimDebrief → sim page → readings.

---

## Task 1: `buildSimFrame` 헬퍼 + POST 재사용

**Files:** Modify `lib/relationship/sim.ts`, `app/api/relationship/sim/route.ts`

- [ ] **Step 1: `lib/relationship/sim.ts` 에 헬퍼 추가** (파일 끝, `appendPersonalityNote` 뒤)

```ts
/** 밤 무대 프레임 고지(결정적 별콩이 노트). POST /sim 생성 시 시드 + GET 재진입 시 재구성 — 단일 원천. */
export function buildSimFrame(relLabel: string, situationLabel: string): string {
  return `여긴 네 마음속 ${relLabel} 인형이 서는 무대야 — 네가 알려준 설명으로 그렸지, 진짜 걔는 아니야. "${situationLabel}" 상황을 편하게 연습해봐. 인형이 실제 걔랑 다르면 대사 밑 👍👎로 알려주면 내가 더 걔답게 만들어줄게. 무슨 말을 할지 막히면 아래 '답변 추천'을, 충분히 해봤으면 '마무리'를 눌러 정리하면 돼.`;
}
```

- [ ] **Step 2: POST 라우트가 헬퍼 사용** — `app/api/relationship/sim/route.ts`

import 교체 (line 11 부근):
```ts
import type { SimMeta } from "@/lib/relationship/sim";
```
→
```ts
import { buildSimFrame, type SimMeta } from "@/lib/relationship/sim";
```

프레임 인라인 문자열 교체:
```ts
  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  const frame = `여긴 네 마음속 ${rel.label} 인형이 서는 무대야 — 네가 알려준 설명으로 그렸지, 진짜 걔는 아니야. "${situation.label}" 상황을 편하게 연습해봐. 인형이 실제 걔랑 다르면 대사 밑 👍👎로 알려주면 내가 더 걔답게 만들어줄게. 무슨 말을 할지 막히면 아래 '답변 추천'을, 충분히 해봤으면 '마무리'를 눌러 정리하면 돼.`;
```
→
```ts
  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  const frame = buildSimFrame(rel.label, situation.label);
```

- [ ] **Step 3: 타입체크** — `npx tsc --noEmit` → EXIT 0. (동작 동일: 프레임 문자열 불변.)

- [ ] **Step 4: 커밋 스킵** (사용자 승인 후 일괄). 변경만 남김.

---

## Task 2: 신규 GET `/api/relationship/sim?id=`

**Files:** Modify `app/api/relationship/sim/route.ts` (POST 함수 끝 뒤에 `GET` 추가)

- [ ] **Step 1: GET 핸들러 추가**

파일 맨 아래(POST 함수 닫는 `}` 뒤)에 추가. 필요한 import는 이미 있음(`getSession`·`getServiceSupabase`·`getSituation`·`RELATIONSHIP_STATUS_LABELS`·`RelationshipStatus`·`SimMeta`·`checkRateLimit`·`getClientIp`·`maybeSweepExpired`) + Task 1의 `buildSimFrame`.

```ts
// 재진입용 판 상태 조회(읽기 전용) — 재개(stage)·재열람(debriefed) 공용. 차감/변경 없음.
export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const bySession = checkRateLimit({ namespace: "sim_get", key: userId, max: 60, windowMs: 60_000 });
  if (!bySession.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, relationship_id, consultation_type, saju_data")
    .eq("id", id)
    .maybeSingle();
  if (!reading || reading.user_id !== userId || reading.consultation_type !== "relationship_sim")
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = (reading.saju_data ?? {}) as SimMeta;
  const situation = getSituation(meta.situationId);
  if (!situation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status")
    .eq("id", reading.relationship_id)
    .maybeSingle();
  if (!rel) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  const frame = buildSimFrame(rel.label, situation.label);

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content, skill_key")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true });

  // 전사 매핑: 프레임(별도 반환)·디브리핑(별도) 제외, 나머지를 who 로.
  const messages: { who: "user" | "doll" | "note"; text: string }[] = [];
  let debrief: string | null = null;
  for (const m of (rows ?? []) as { role: string; content: string; skill_key: string | null }[]) {
    if (m.content === frame) continue; // 프레임 고지(재구성해 별도 반환)
    if (m.skill_key === "sim_debrief") { debrief = m.content; continue; }
    if (m.role === "user") messages.push({ who: "user", text: m.content });
    else if (m.skill_key === "sim_note") messages.push({ who: "note", text: m.content });
    else messages.push({ who: "doll", text: m.content });
  }

  return NextResponse.json({
    simReadingId: reading.id,
    relationshipId: reading.relationship_id,
    situationId: situation.id,
    statusLabel,
    label: rel.label,
    status: rel.status,
    phase: meta.phase,
    frame,
    messages,
    debrief,
    sendMessage: meta.sendMessage ?? null,
  });
}
```

- [ ] **Step 2: 타입체크** — `npx tsc --noEmit` → EXIT 0. (런타임은 Task 7 브라우저에서 실증.)

---

## Task 3: `NightStage` — `initialMessages` + `readOnly`

**Files:** Modify `components/relationship/sim/NightStage.tsx`

- [ ] **Step 1: props 추가** — `NightStageProps` 인터페이스

```ts
export interface NightStageProps {
  simReadingId: string;
  status: RelationshipStatus;
  label: string;
  frame: string;
  balance: number;
  onDebrief: () => void;
}
```
→
```ts
export interface NightStageProps {
  simReadingId: string;
  status: RelationshipStatus;
  label: string;
  frame: string;
  balance: number;
  onDebrief: () => void;
  /** 재진입 시 이전 대화 시드(프레임 제외). 없으면 새 판(빈 상태). */
  initialMessages?: { who: "user" | "doll" | "note"; text: string }[];
  /** 완료 판 재열람 — 하단 입력바 숨기고 '정리 보기'만, 인형 피드백(👍👎) 숨김. */
  readOnly?: boolean;
}
```

- [ ] **Step 2: messages/started 시드** — state 초기화 교체

```ts
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
```
→
```ts
  const [started, setStarted] = useState((props.initialMessages?.length ?? 0) > 0);
  const [messages, setMessages] = useState<Msg[]>(
    () => (props.initialMessages ?? []).map((m, i) => ({ id: i + 1, who: m.who, text: m.text }))
  );
```
(시드 id 는 1..N — 이후 라이브의 `Date.now()` 와 충돌 없음.)

- [ ] **Step 3: 인형 버블 피드백 readOnly 시 숨김** — doll 렌더의 `SimBubble`

```tsx
              <SimBubble key={m.id} content={m.text} onFeedback={sendFeedback} />
```
→
```tsx
              <SimBubble key={m.id} content={m.text} onFeedback={props.readOnly ? undefined : sendFeedback} />
```
(`SimBubble` 은 `onFeedback` 없으면 👍👎 미표시 — 기존 스트리밍 처리와 동일.)

- [ ] **Step 4: 하단바 readOnly 분기** — 하단 입력바 `<div>` 를 조건 래핑

여는 줄 교체:
```tsx
        {/* 하단 한 줄 — 모두 h-11 로 높이 통일, items-stretch 로 세로 정렬(입력창 여러 줄이면 함께 늘어남) */}
        <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 pt-2.5 pb-3">
```
→
```tsx
        {/* 하단 한 줄 — readOnly(완료 재열람)면 '정리 보기'만, 아니면 입력바 */}
        {props.readOnly ? (
          <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 py-3">
            <button
              type="button"
              onClick={props.onDebrief}
              className="w-full h-11 rounded-xl text-gold-soft border border-gold/40 font-bold text-[13px] hover:bg-gold/10 transition-colors"
            >
              🌙 정리 보기
            </button>
          </div>
        ) : (
        <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 pt-2.5 pb-3">
```

닫는 줄 교체 (마무리 버튼 블록의 닫힘 — 입력바 `</div>` 뒤에 `)}` 추가):
```tsx
              마무리
            </button>
          </div>
        </div>

        {suggestions.length > 0 && (
```
→
```tsx
              마무리
            </button>
          </div>
        </div>
        )}

        {suggestions.length > 0 && (
```

- [ ] **Step 5: 타입체크** — `npx tsc --noEmit` → EXIT 0.

---

## Task 4: `SimDebrief` — 저장 디브리핑 프리로드

**Files:** Modify `components/relationship/sim/SimDebrief.tsx`

- [ ] **Step 1: 시그니처 + 프리로드 분기**

```tsx
export default function SimDebrief({ simReadingId }: { simReadingId: string }) {
```
→
```tsx
export default function SimDebrief({
  simReadingId,
  initialDebrief,
  initialSendMessage,
}: {
  simReadingId: string;
  /** 완료 판 재열람 — 저장된 디브리핑 프리로드(있으면 생성 fetch 스킵). */
  initialDebrief?: string;
  initialSendMessage?: string | null;
}) {
```

mount effect 앞부분 교체:
```tsx
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
```
→
```tsx
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // 재열람: 저장 디브리핑 프리로드 → chat 라우트(생성) 안 부름(완료 판은 409).
    if (initialDebrief != null) {
      setDebrief(initialDebrief);
      setSendMessage(initialSendMessage ?? null);
      setState("done");
      return;
    }
    (async () => {
```

deps 배열에 프리로드 값 추가 (mount 1회라 값 변화 없음 — lint 안정용):
```tsx
    })();
  }, [simReadingId]);
```
→
```tsx
    })();
  }, [simReadingId, initialDebrief, initialSendMessage]);
```

- [ ] **Step 2: 타입체크** — `npx tsc --noEmit` → EXIT 0.

---

## Task 5: 시뮬 페이지 `?sim=` 로드 경로

**Files:** Modify `app/relationship/sim/page.tsx`

- [ ] **Step 1: sim 파라미터 + 상태 추가**

```tsx
  const relationshipId = params.get("rel");
```
→
```tsx
  const relationshipId = params.get("rel");
  const simReadingParam = params.get("sim");
```

state 블록에 추가 (`startedRef` 선언 앞):
```tsx
  const [balance, setBalance] = useState(0);
  const startedRef = useRef(false);
```
→
```tsx
  const [balance, setBalance] = useState(0);
  // 재진입(?sim=) 로드분 — 이전 대화 시드 · 완료 디브리핑 프리로드 · 읽기전용 여부.
  const [initialMessages, setInitialMessages] = useState<{ who: "user" | "doll" | "note"; text: string }[] | null>(null);
  const [loadedDebrief, setLoadedDebrief] = useState<{ debrief: string; sendMessage: string | null } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const startedRef = useRef(false);
```

- [ ] **Step 2: 마운트 이펙트에 재진입 로드 분기 삽입**

auth 통과 직후(`if (!me?.isAuthenticated) { … return; }` 뒤), 기존 `if (!relationshipId)` 앞에 삽입:
```tsx
      if (!me?.isAuthenticated) {
        router.replace(`/login?next=/relationship/sim?rel=${relationshipId ?? ""}`);
        return;
      }
      if (!relationshipId) {
```
→
```tsx
      if (!me?.isAuthenticated) {
        router.replace(`/login?next=/relationship/sim?rel=${relationshipId ?? ""}`);
        return;
      }
      // ── 재진입(?sim=): 기존 판 로드 → phase 로 분기(차감 없음) ──
      if (simReadingParam) {
        const data = await fetch(`/api/relationship/sim?id=${simReadingParam}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!data?.simReadingId) {
          router.replace("/relationship");
          return;
        }
        setRel({ id: data.relationshipId, label: data.label, status: data.status });
        setSession({ simReadingId: data.simReadingId, frame: data.frame, statusLabel: data.statusLabel });
        setInitialMessages(Array.isArray(data.messages) ? data.messages : []);
        if (data.phase === "debriefed") {
          setReadOnly(true);
          setLoadedDebrief({ debrief: data.debrief ?? "", sendMessage: data.sendMessage ?? null });
        }
        setPhase("stage");
        setLoading(false);
        return;
      }
      if (!relationshipId) {
```

deps 배열 교체:
```tsx
  }, [relationshipId, router]);
```
→
```tsx
  }, [relationshipId, simReadingParam, router]);
```

- [ ] **Step 3: 렌더 분기에 프리로드 prop 전달** — `phase === "stage"`/`"debrief"` 블록 교체

```tsx
        {phase === "stage" && session && (
          <NightStage
            simReadingId={session.simReadingId}
            status={rel.status as RelationshipStatus}
            label={rel.label}
            frame={session.frame}
            balance={balance}
            onDebrief={() => setPhase("debrief")}
          />
        )}
        {phase === "debrief" && session && <SimDebrief simReadingId={session.simReadingId} />}
```
→
```tsx
        {phase === "stage" && session && (
          <NightStage
            simReadingId={session.simReadingId}
            status={rel.status as RelationshipStatus}
            label={rel.label}
            frame={session.frame}
            balance={balance}
            initialMessages={initialMessages ?? undefined}
            readOnly={readOnly}
            onDebrief={() => setPhase("debrief")}
          />
        )}
        {phase === "debrief" && session && (
          <SimDebrief
            simReadingId={session.simReadingId}
            initialDebrief={loadedDebrief?.debrief}
            initialSendMessage={loadedDebrief?.sendMessage}
          />
        )}
```

- [ ] **Step 4: 타입체크** — `npx tsc --noEmit` → EXIT 0. `?rel=`(신규 생성) 경로는 `initialMessages=null`·`readOnly=false`·`loadedDebrief=null` 이라 동작 불변.

---

## Task 6: `renderSimCard` 링크 → `?sim=<id>`

**Files:** Modify `app/readings/page.tsx`

- [ ] **Step 1: href + 주석 교체** — `renderSimCard`

```tsx
// 시뮬 카드 — 완료(debriefed)="완료"/진행중(stage)="진행 중" 배지. 둘 다 우리 사이 파일 허브로 보낸다.
// ⚠️ /relationship/sim 은 기존 미완료 판을 재개하지 않고 매번 새 판을 만들며 SIM_COST 를 재차감한다
// (재개 인프라 없음) — 그래서 진행중 판도 "이어하기"를 약속하지 않고 안전하게 허브로만 보낸다
// (별 오차감·고아 판 생성 방지, 2026-08-09 안전화).
function renderSimCard(r: ReadingItem, relLabelById: Map<string, string>) {
  const done = r.sajuData?.phase === "debriefed";
  const href = r.relationshipId ? `/relationship?rel=${r.relationshipId}` : "/relationship";
```
→
```tsx
// 시뮬 카드 — 완료(debriefed)="완료"/진행중(stage)="진행 중" 배지.
// 재진입: /relationship/sim?sim=<id> → 완료=디브리핑 재열람, 진행중=재개(무차감).
// (재진입 인프라 = specs/2026-08-09-sim-reentry-design.md. GET·read-only·POST 미호출이라 재차감·고아판 없음.)
function renderSimCard(r: ReadingItem, relLabelById: Map<string, string>) {
  const done = r.sajuData?.phase === "debriefed";
  const href = `/relationship/sim?sim=${r.id}`;
```

(`relLabelById` 는 서브텍스트 `relLabel` 에 계속 쓰이므로 유지.)

- [ ] **Step 2: 타입체크** — `npx tsc --noEmit` → EXIT 0.

---

## Task 7: 빌드 + 브라우저 실증 (최종 게이트)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 프로덕션 빌드** — `npm run build` → EXIT 0.

- [ ] **Step 2: dev + 세션 주입** — `preview_start { name: "byeolkong-dev" }`, `document.cookie="byeolkong_user_id=<dev 유저>; path=/"` 주입(메모리 [[browser-e2e-session-injection]]). 시뮬 판 있는 유저 필요(예: 이건희 `0370400f…` — 시뮬 5판, 완료 1·진행중 4).

- [ ] **Step 3: 완료 판 재열람** — `/readings?tab=sim` → **완료** 배지 카드 클릭 → `/relationship/sim?sim=<id>`:
  - NightStage read-only(전사 = 인형 대화 재현, 입력바 없음, 👍👎 없음) + `🌙 정리 보기` 버튼.
  - 정리 보기 → SimDebrief(저장된 정리 + 보낼 말, 로딩 스피너 없이 즉시).
  - 확인: 별 잔액 변화 없음(재차감 0). 콘솔 에러 0.

- [ ] **Step 4: 진행 중 판 재개** — 뒤로 → **진행 중** 배지 카드 클릭:
  - NightStage 라이브 + 이전 대화 시드(인형 접힘) + 입력바 활성. 한 턴 보내 이어지는지(새 판 아님 = 같은 대화 이어짐) 확인. 별 잔액 변화 없음(재개 자체 무차감; suggest 만 유료).
  - read_page/get_page_text 로 이전 대화가 프리로드됐는지 단정(스크린샷 병행).

- [ ] **Step 5: 신규 생성 회귀** — `/relationship` → 시뮬 새로 시작(`?rel=` 경로) → 상황 선택 → StarConfirm → 정상 차감·진입(기존 흐름 불변) 확인.

---

## Self-Review (플랜↔스펙 대조)

**Spec coverage:** GET 엔드포인트(§1)→Task 2 · 페이지 `?sim` 분기(§2)→Task 5 · NightStage/SimDebrief props(§3)→Task 3·4 · buildSimFrame(§4)→Task 1 · renderSimCard(§5)→Task 6 · 안전/무차감→Task 5(POST 미호출)+Task 7(잔액 확인). ✅

**Placeholder scan:** 전 스텝 완성 코드, TBD 없음. ✅

**Type consistency:** GET 응답 필드(`simReadingId`·`relationshipId`·`label`·`status`·`phase`·`frame`·`messages`·`debrief`·`sendMessage`) ↔ 페이지 소비 일치. `initialMessages` who 유니온(`"user"|"doll"|"note"`) NightStage·GET·페이지 동일. `SimDebrief` 프리로드 옵셔널. ✅

**열린 세부(구현 중 확인):**
- 프레임 문자열 유일성(`content===frame` 이 위기 노트와 안 겹침) — Task 7 실데이터 확인. 겹치면 프레임 메시지에 마커 추가.
- readOnly 하단 '정리 보기' 버튼 위치·톤 실렌더 미세조정.
- 프로필 삭제된 진행중 판 재개 시 chat say 가 `no_profile` 처리 — 현행 chat 라우트 동작 따름(재개 진입은 허용, 발화 시 안내).
