# 끊어 보내기 묶음 응답 + 부재 감지 멘트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고민 상담 대화에서 유저가 말풍선을 끊어 보내면 잠깐 모았다가 별콩이가 한 번만 응답하고, 유저가 자리를 비우면 별콩이가 먼저 안부 멘트를 건다.

**Architecture:** 거의 클라이언트 `app/tarot/reading/page.tsx` 한정. "활동(타이핑·전송) 후 2초 + 입력창 빔"일 때만 대기 조각을 합쳐 1턴으로 전송하는 debounce 플러시. 응답 종료 후 무활동이면 DB 미저장·턴 미반영 ephemeral 멘트를 2단계(10s, +40s)로 표시. 서버 라우트 무수정.

**Tech Stack:** Next.js 16 / React 19 / TypeScript. 테스트 하니스 없음 → 검증은 `npx tsc --noEmit` + Claude_Preview MCP 수동 동작 확인.

**검증 방식 메모 (TDD 미적용 사유):** 이 레포는 단위 테스트 프레임워크가 없고(`package.json` scripts = dev/build/start), 배포 플로우가 `tsc` 통과 + 프리뷰 확인이다. 타이머 기반 React UI를 위해 jest/RTL를 새로 까는 건 surgical/YAGNI 위반이라 도입하지 않는다. 각 태스크 검증 = 타입체크 + 프리뷰 시나리오.

**공통 명령 (셸 cwd가 매번 v1로 리셋됨 — 항상 prefix):**
```bash
cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit
```
기대: 에러 0줄(기존 경고 외 신규 에러 없음).

**프리뷰:** Claude_Preview MCP serverId `075ee536-6ada-4001-b985-7f5212cf970e` (localhost:3001 = v2 dev). 대화 진입은 `/tarot` → 카드 뽑기 → reading. 이미 띄워진 대화 세션을 재사용해도 됨.

---

## File Structure

- Modify: `app/tarot/reading/page.tsx` — 유일한 변경 파일. 타이머 ref + 대기 큐 + 플러시/idle 로직 추가, `handleSubmit`/`handleFinish`/`sendMessage`/`finishMessage`/`onChange` 수정.
- 서버(`app/api/consultations/tarot/chat/route.ts`), `lib/claude.ts` 무수정.

스테일 클로저 회피 패턴: setTimeout 콜백은 **최신 렌더의 함수**를 ref(`flushPendingRef`/`runIdleNudgeRef`)로 가리켜 호출한다. 그래서 `flushPending`/`runIdleNudge` 내부는 state(`input`,`isStreaming`,`isEnded`,`readingId`,`messages`)를 직접 읽어도 항상 최신이다.

---

## Task 1: 스캐폴딩 (타입·상수·ref·미러·타이머 헬퍼·cleanup)

행위 변화 없음. 이후 태스크가 쓸 토대만 깐다.

**Files:**
- Modify: `app/tarot/reading/page.tsx`

- [ ] **Step 1: `Message`에 ephemeral 추가**

```tsx
interface Message {
  role: "user" | "assistant";
  content: string;
  /** 부재 감지 멘트 — 화면 표시 전용. API/ DB/ 턴 카운트 제외 */
  ephemeral?: boolean;
}
```

- [ ] **Step 2: 상수 추가 (`TYPING_SPEED` 등 상단 상수 블록 옆)**

```tsx
const DEBOUNCE_FLUSH_MS = 2000;
const IDLE_NUDGE_1_MS = 10000;
const IDLE_NUDGE_2_MS = 40000; // 1단계 멘트 이후 추가 대기
const NUDGE_STAGE_1 = [
  "어디 갔어~? 천천히 생각해도 괜찮아 :)",
  "음, 아직 거기 있어? 별콩이 여기서 기다릴게",
  "다른 거 하는 중이야? 돌아오면 마저 봐줄게",
];
const NUDGE_STAGE_2 = [
  "별콩이 여기 있을게, 천천히 와",
  "급할 거 없어. 마음 정리되면 다시 얘기하자",
];
```

- [ ] **Step 3: 신규 ref 추가 (`TarotReadingInner` 내부 ref 선언부)**

```tsx
const messagesRef = useRef<Message[]>([]);
const pendingFragmentsRef = useRef<string[]>([]);
const baseHistoryRef = useRef<Message[]>([]);
const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const idleStageRef = useRef(0); // 0=아직, 1=1단계 후, 2=종료
const flushPendingRef = useRef<() => void>(() => {});
const runIdleNudgeRef = useRef<() => void>(() => {});
```

- [ ] **Step 4: 미러 효과 + cleanup 수정**

기존 `useEffect(() => { return () => stopTyping(); }, []);` 를 아래로 교체하고, 미러 효과를 추가한다.

```tsx
useEffect(() => {
  messagesRef.current = messages;
});

useEffect(() => {
  return () => {
    stopTyping();
    clearFlushTimer();
    clearIdleTimer();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 5: 타이머 헬퍼 함수 추가 (`stopTyping` 근처)**

```tsx
function clearFlushTimer() {
  if (flushTimerRef.current) {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
  }
}

function clearIdleTimer() {
  if (idleTimerRef.current) {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }
}

function armFlushTimer() {
  clearFlushTimer();
  flushTimerRef.current = setTimeout(
    () => flushPendingRef.current(),
    DEBOUNCE_FLUSH_MS
  );
}

function armIdleTimer(delay: number) {
  clearIdleTimer();
  idleTimerRef.current = setTimeout(
    () => runIdleNudgeRef.current(),
    delay
  );
}
```

- [ ] **Step 6: 타입체크**

Run: `cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit`
기대: 신규 에러 없음. (`flushPending`/`runIdleNudge` 미정의지만 `flushPendingRef`는 빈 함수로 초기화돼 있어 OK. `armFlushTimer`/`armIdleTimer` 미사용 경고는 lint 영역이라 tsc는 통과.)

- [ ] **Step 7: 커밋 (사용자가 커밋 요청 시에만)**

```bash
git add app/tarot/reading/page.tsx
git commit -m "타로 대화 — 끊어보내기/부재멘트 스캐폴딩(타입·상수·타이머 ref)"
```

---

## Task 2: 끊어 보내기 묶음 응답 (debounce 플러시 코어)

`handleSubmit`을 즉시 전송 → 대기 큐 적재로 바꾸고, `flushPending`/`sendMessage`를 구현한다.

**Files:**
- Modify: `app/tarot/reading/page.tsx`

- [ ] **Step 1: `sendMessage` 시그니처에 opts 추가 + ephemeral 필터 + 진입 시 타이머 해제**

기존:
```tsx
async function sendMessage(history: Message[], rid: string, forceEnd = false) {
  setMessages(history);
  setIsStreaming(true);
```
교체:
```tsx
async function sendMessage(
  history: Message[],
  rid: string,
  opts?: { forceEnd?: boolean; skipSetMessages?: boolean }
) {
  const forceEnd = opts?.forceEnd ?? false;
  clearFlushTimer();
  clearIdleTimer();
  if (!opts?.skipSetMessages) setMessages(history);
  setIsStreaming(true);
```
그리고 fetch body의 `messages: history` → `messages: history.filter((m) => !m.ephemeral)` 로 변경:
```tsx
body: JSON.stringify({
  readingId: rid,
  messages: history.filter((m) => !m.ephemeral),
  forceEnd,
}),
```

- [ ] **Step 2: 첫 자동 풀이 호출부 유지 확인**

`useEffect` 첫 풀이 시작부의 호출은 그대로 둔다(opts 없음 → setMessages 수행, 기존과 동일):
```tsx
void sendMessage([{ role: "user", content: parsed.concern }], data.id);
```

- [ ] **Step 3: `handleSubmit` 교체 (즉시 전송 → 대기 적재)**

```tsx
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const text = input.trim();
  if (!text || isStreaming || isEnded || !readingId) return;

  // 대기 묶음 시작(0→1) 시점에 현재까지의 히스토리를 base로 스냅샷
  if (pendingFragmentsRef.current.length === 0) {
    baseHistoryRef.current = messagesRef.current;
  }
  pendingFragmentsRef.current.push(text);

  // 화면엔 보낸 대로 user 버블 즉시 표시
  setMessages((prev) => [...prev, { role: "user", content: text }]);
  setInput("");
  if (inputRef.current) inputRef.current.style.height = "auto";

  // idle 중단 + 플러시 타이머 재무장
  clearIdleTimer();
  idleStageRef.current = 0;
  armFlushTimer();

  // 유저 버블이 상단 근처에 오도록 스크롤 (기존 로직 유지)
  suppressScrollUntilRef.current = Date.now() + 1500;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const userBubbles = el.querySelectorAll<HTMLElement>(".justify-end");
      const last = userBubbles[userBubbles.length - 1];
      if (last) {
        el.scrollTo({ top: Math.max(0, last.offsetTop - 16), behavior: "smooth" });
      }
    });
  });
};
```

- [ ] **Step 4: `flushPending` 구현 (`sendMessage` 근처에 추가)**

```tsx
function flushPending() {
  if (pendingFragmentsRef.current.length === 0) return;
  if (input.trim()) return; // 입력창에 글자 남아있으면 보류 (다음 활동 때 재무장)
  if (isStreaming || isEnded || !readingId) return;

  const merged = pendingFragmentsRef.current.join("\n");
  pendingFragmentsRef.current = [];
  clearFlushTimer();

  const apiHistory: Message[] = [
    ...baseHistoryRef.current.filter((m) => !m.ephemeral),
    { role: "user", content: merged },
  ];
  void sendMessage(apiHistory, readingId, { skipSetMessages: true });

  suppressScrollUntilRef.current = Date.now() + 1500;
}
```

- [ ] **Step 5: `flushPendingRef` 최신화 효과 추가 (미러 효과 옆)**

```tsx
useEffect(() => {
  flushPendingRef.current = flushPending;
});
```

- [ ] **Step 6: 타입체크**

Run: `cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit`
기대: 신규 에러 없음.

- [ ] **Step 7: 프리뷰 동작 확인**

1. 대화 진입 후 별콩이 첫 풀이가 끝난 상태에서, 짧은 메시지 3개를 빠르게 연속 전송.
   - 기대: user 버블 3개 즉시 표시 → 약 2초 후 별콩이가 **1회만** 응답(3개 합친 맥락 반영).
2. 메시지 1개 전송 후, 입력창에 글자를 천천히(>2초) 타이핑.
   - 기대: 타이핑하는 동안 별콩이 응답이 **안 나감**. 전송하면 그제서야 묶여 응답.
3. 입력창에 글자를 남긴 채 5초 정지.
   - 기대: 응답 **안 나감**.

- [ ] **Step 8: 커밋 (사용자가 커밋 요청 시에만)**

```bash
git add app/tarot/reading/page.tsx
git commit -m "타로 대화 — 끊어보내기 debounce 묶음 응답(2초)"
```

---

## Task 3: 부재 감지 멘트 (ephemeral nudge, 2단계)

응답 종료 후 무활동이면 별콩이가 먼저 말 건다. DB·Claude·턴 카운트 미반영.

**Files:**
- Modify: `app/tarot/reading/page.tsx`

- [ ] **Step 1: `pushNudge` 구현 (`flushPending` 근처)**

```tsx
function pushNudge(pool: string[]) {
  const text = pool[Math.floor(Math.random() * pool.length)];
  setMessages((prev) => [
    ...prev,
    { role: "assistant", content: text, ephemeral: true },
  ]);
  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
}
```

- [ ] **Step 2: `runIdleNudge` 구현**

```tsx
function runIdleNudge() {
  // 게이트: 대기 조각 없음 + 입력 빔 + 비스트리밍 + 미종료 + 별콩이가 1회 이상 응답
  if (pendingFragmentsRef.current.length > 0) return;
  if (input.trim()) return;
  if (isStreaming || isEnded || !readingId) return;
  const assistantSpoke = messagesRef.current.some(
    (m) => m.role === "assistant" && !m.ephemeral
  );
  if (!assistantSpoke) return;

  const stage = idleStageRef.current;
  if (stage === 0) {
    pushNudge(NUDGE_STAGE_1);
    idleStageRef.current = 1;
    armIdleTimer(IDLE_NUDGE_2_MS);
  } else if (stage === 1) {
    pushNudge(NUDGE_STAGE_2);
    idleStageRef.current = 2;
    // 종료 — 더는 무장하지 않음
  }
}
```

- [ ] **Step 3: `runIdleNudgeRef` 최신화 효과 추가**

```tsx
useEffect(() => {
  runIdleNudgeRef.current = runIdleNudge;
});
```

- [ ] **Step 4: 응답 종료 시 idle 타이머 무장 (`finishMessage` 수정)**

`finishMessage`의 `setTimeout(...)` 내부, 메시지 확정 직후 분기 끝에 추가한다. `hasEnd`가 아니면(대화가 안 끝났으면) idle 1단계 무장.

기존 끝부분:
```tsx
    setStreamingBubbles([]);
    setIsStreaming(false);
    setActiveCardIndex(null);
    if (hasEnd) setIsEnded(true);
  }, 80);
```
교체:
```tsx
    setStreamingBubbles([]);
    setIsStreaming(false);
    setActiveCardIndex(null);
    if (hasEnd) {
      setIsEnded(true);
    } else {
      idleStageRef.current = 0;
      armIdleTimer(IDLE_NUDGE_1_MS);
    }
  }, 80);
```

- [ ] **Step 5: 타이핑(onChange) 시 idle 리셋 + 플러시 재무장**

textarea `onChange` 를 아래로 교체:
```tsx
onChange={(e) => {
  setInput(e.target.value);
  autoResizeInput();
  clearIdleTimer();
  idleStageRef.current = 0;
  if (pendingFragmentsRef.current.length > 0) armFlushTimer();
}}
```

- [ ] **Step 6: 타입체크**

Run: `cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit`
기대: 신규 에러 없음.

- [ ] **Step 7: 프리뷰 동작 확인**

1. 별콩이 응답이 끝난 뒤 아무것도 안 하고 ~10초 대기.
   - 기대: 별콩이 부재 멘트(STAGE_1) 1회 등장.
2. 그 후로도 계속 무활동 ~40초.
   - 기대: 부드러운 멘트(STAGE_2) 1회 더 등장. 이후 추가 멘트 **없음**.
3. 멘트 등장 후 유저가 입력/전송.
   - 기대: 정상 흐름 진행, 멘트는 화면에 그대로 남음. 다음 별콩이 응답이 멘트 아래 정상 순서로 표시.
4. 콘솔/네트워크: 멘트 등장 시 `/api/consultations/tarot/chat` 호출이 **발생하지 않음** 확인(부재 멘트는 클라 전용).

- [ ] **Step 8: 커밋 (사용자가 커밋 요청 시에만)**

```bash
git add app/tarot/reading/page.tsx
git commit -m "타로 대화 — 부재 감지 멘트(10s/+40s, ephemeral)"
```

---

## Task 4: "대화 마무리" 배칭 정합성

`handleFinish`가 대기 조각 + 현재 입력창 내용을 누락 없이 합쳐 `forceEnd`로 보낸다.

**Files:**
- Modify: `app/tarot/reading/page.tsx`

- [ ] **Step 1: `handleFinish` 교체**

```tsx
const handleFinish = () => {
  if (isStreaming || isEnded || !readingId) return;
  clearFlushTimer();
  clearIdleTimer();
  idleStageRef.current = 0;

  const tail = input.trim();
  const hadPending = pendingFragmentsRef.current.length > 0;
  const base = hadPending ? baseHistoryRef.current : messagesRef.current;
  const frags = [...pendingFragmentsRef.current];

  if (tail) {
    frags.push(tail);
    // 아직 버블이 없는 현재 입력은 화면에도 추가
    setMessages((prev) => [...prev, { role: "user", content: tail }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }
  pendingFragmentsRef.current = [];

  const merged = frags.length > 0 ? frags.join("\n") : "이제 대화 마무리할게";

  const apiHistory: Message[] = [
    ...base.filter((m) => !m.ephemeral),
    { role: "user", content: merged },
  ];
  void sendMessage(apiHistory, readingId, {
    forceEnd: true,
    skipSetMessages: true,
  });

  suppressScrollUntilRef.current = Date.now() + 1500;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const userBubbles = el.querySelectorAll<HTMLElement>(".justify-end");
      const last = userBubbles[userBubbles.length - 1];
      if (last) {
        el.scrollTo({ top: Math.max(0, last.offsetTop - 16), behavior: "smooth" });
      }
    });
  });
};
```

참고: `frags.length === 0`(대기 없음 + 입력 없음)일 때 merged 기본 문구는 화면 버블로는 안 보이지만 별콩이가 마무리 응답 후 [END]를 내보낸다. 기존에는 이 문구가 버블로 보였으나, 마무리 직후 [END] CTA로 전환되므로 영향 미미.

- [ ] **Step 2: 타입체크**

Run: `cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit`
기대: 신규 에러 없음.

- [ ] **Step 3: 프리뷰 동작 확인**

1. 조각 2개 전송 직후(2초 지나기 전) "대화 마무리" 클릭.
   - 기대: 대기 조각 2개 + (입력창 내용 있으면 그것까지) 합쳐 1회 전송 → 별콩이 마무리 응답 + [END] → "결과 보기" CTA.
2. 입력창에 글자 쓴 채 "대화 마무리" 클릭.
   - 기대: 그 글자도 포함되어 전송, 입력창 비워짐.
3. 아무 입력 없이 "대화 마무리" 클릭.
   - 기대: 별콩이 마무리 응답 + [END].

- [ ] **Step 4: 커밋 (사용자가 커밋 요청 시에만)**

```bash
git add app/tarot/reading/page.tsx
git commit -m "타로 대화 — 대화 마무리 시 대기 조각/입력 합쳐 전송"
```

---

## Task 5: 전체 회귀 확인 (스펙 §8)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 타입체크 최종**

Run: `cd /c/Users/c/Desktop/vibe/project/byeolkong_talk && npx tsc --noEmit`
기대: 신규 에러 없음.

- [ ] **Step 2: 스펙 §8 검증 기준 일괄 프리뷰 확인**

- 끊어 3번 전송 후 멈춤 → 별콩이 1회만 응답(합친 맥락).
- 전송 후 다음 줄 천천히 타이핑 → 타이핑 동안 응답 안 나감.
- 입력창에 글자 남긴 채 5s 정지 → 응답 안 나감.
- 응답 종료 후 10s 무활동 → 멘트 1회 / 추가 40s → 멘트 1회 더 / 그 후 멈춤.
- 부재 멘트 등장해도 [END] 턴/글자 카운트 영향 없음(채팅 API 미호출, DB 미저장 → 새로고침/이어하기 시 멘트 사라짐 확인).
- "대화 마무리" 시 대기 조각·입력 누락 없이 합쳐 전송 + [END].
- (회귀) 첫 자동 풀이 정상, 단발 follow-up(1개 전송→2초→응답) 정상, 이어하기(resume) 복원 정상.

- [ ] **Step 3: 배포 (사용자가 명시적으로 요청할 때만)**

기존 플로우: dev 커밋 → push dev → dev.byeolkongtalk.com 확인 → main fast-forward push. PR 없음. `.serena/`/`.gitignore`/`.vercel`/시크릿 스테이징 제외.

---

## Self-Review

**Spec coverage:**
- §3.1 활동 기반 debounce → Task 2 (handleSubmit/flushPending/armFlushTimer/onChange).
- §3.2 표현(화면 N버블/API·DB 합침) → Task 2 (per-fragment 버블 + baseHistoryRef + merged apiHistory + ephemeral 필터).
- §3.3 부재 멘트 2단계 ephemeral → Task 3.
- §4 타이머 상태 머신 → Task 1(헬퍼) + Task 2/3(무장·해제 지점) + onChange/finishMessage.
- §5 영향 함수 → Task 1~4 전부 매핑.
- §6 범위 밖 → 계획에 미포함(스트리밍 중 끼어들기/Claude 생성 멘트/수동 즉시전송).
- §8 검증 → Task 5.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TODO/TBD 없음.

**Type consistency:** `Message.ephemeral` Task1 정의 → Task2/3/4에서 동일 사용. `sendMessage(history, rid, opts?)` Task2 정의 → flushPending/handleFinish/첫풀이 호출 일치. `flushPendingRef`/`runIdleNudgeRef`/`armFlushTimer`/`armIdleTimer`/`clearFlushTimer`/`clearIdleTimer` 명칭 전 태스크 일관.
