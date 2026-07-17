# W3 열린 수렴→결과화면 단절 해소 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 증발 중인 유저를 세션 안에서 결과 화면으로 유도(출구 nudge)하고, 놓친 유저는 내 고민톡에서 결과로 회생시킨다.

**Architecture:** 서버가 wrap-mode를 응답 헤더로 노출 → 클라가 converge 이후 idle 60초에 별콩이 로컬 멘트+[결과 카드 보기] 칩 표시 → 기존 forceEnd 흐름 재사용. 사후엔 /api/readings가 stale(6h) 미완료 리딩을 resultReady로 lazy 판정. DB 변경 없음.

**Tech:** Next.js 16 App Router, 기존 tarot `ephemeral` 메시지 패턴 재사용.

**Spec:** [설계](../specs/2026-07-17-w3-open-convergence-result-gap-design.md)

---

### Task 1: 서버 X-Wrap-Mode 헤더

**Files:** Modify `lib/claude.ts` (computeWrapMode export), `app/api/consultations/saju/chat/route.ts`, `app/api/consultations/tarot/chat/route.ts`

- [ ] `lib/claude.ts`의 `computeWrapMode`(현재 tarot 전용 내부 함수, 시그니처 `(upcomingTurn, cumulativeChars, t: WrapThresholds)`)를 `export`. saju의 인라인 wrap 판정과 동일 공식임을 확인 (naturalHardcap/absHardcap/converge 조건 일치).
- [ ] saju route: `mustEnd` 계산부 근처에서
  ```ts
  const wrapMode = computeWrapMode(assistantTurnsSoFar + 1, cumulativeAssistantChars, {
    convergeStartTurn: thresholdOverride?.convergeStartTurn ?? CONVERGE_START_TURN,
    convergeStartChars: thresholdOverride?.convergeStartChars ?? CONVERGE_START_CHARS,
    hardCapTurn: thresholdOverride?.hardCapTurn ?? HARD_CAP_TURN,
    hardCapChars: thresholdOverride?.hardCapChars ?? HARD_CAP_CHARS,
    absTurnCap: effAbsTurnCap,
  }).mode;
  responseHeaders["X-Wrap-Mode"] = wrapMode;
  ```
- [ ] tarot route: `computeWrapMode(assistantTurnsSoFar + 1, cumulativeAssistantChars, effT ?? baseT).mode` → 동일 헤더.
- [ ] `npm run build` 통과 확인 → commit.

### Task 2: tarot 출구 nudge (3단계)

**Files:** Modify `app/tarot/reading/page.tsx`

- [ ] 상수: `IDLE_EXIT_MS = 60_000`, `EXIT_NUDGE` 문구 풀(2~3개, "오늘은 여기까지 해도 충분해. 지금까지 얘기, 결과 카드로 만들어둘게 — 보고 갈래?" 류), `FINISH_PHRASE_EXIT = "오늘은 여기서 마무리할게"` (칩 경유 계측용 — 기존 버튼의 "대화 마무리할게"와 구분).
- [ ] `wrapModeRef = useRef<"free"|"converge"|"hardcap">("free")` — sendMessage에서 `r.headers.get("X-Wrap-Mode")` 저장.
- [ ] exit-eligible 판정: `wrapModeRef.current !== "free" || recoAttach 에 항목 존재`.
- [ ] `runIdleNudge` stage 2에서 `armIdleTimer(IDLE_EXIT_MS)` 추가, stage 2→3: eligible이면 `pushNudge(EXIT_NUDGE)` + `setExitOffer(true)` (idleStageRef=3).
- [ ] 칩 렌더: `exitOffer && !isStreaming && !isEnded`일 때 입력창 위(또는 마지막 버블 아래) `✨ 결과 카드 보기` 버튼 → `handleFinish`를 phrase 파라미터화해 `FINISH_PHRASE_EXIT`로 호출. `submitText`/`handleFinish`/스트림 시작 시 `setExitOffer(false)`.
- [ ] build → commit.

### Task 3: saju 출구 nudge (이식)

**Files:** Modify `app/(consultations)/saju/reading/page.tsx`

- [ ] `Message`에 `ephemeral?: boolean` 추가. `sendMessage`의 fetch body를 `history.filter(m => !m.ephemeral).map(m => ({role: m.role, content: m.content}))`로 — nudge 오염 차단 + tarot route에만 있던 role/content 스트리핑 서버 안전망의 클라판.
- [ ] 스트림 완료 시(assistant 버블 확정 후) eligible(`wrapModeRef !== "free" || recoAttach 존재`)이면 60초 idle 타이머 → 별콩이 ephemeral 버블(EXIT_NUDGE) + `setExitOffer(true)`. 유저 입력 submit·새 스트림 시작 시 타이머/offer 해제. (saju엔 stage1/2 nudge가 없으므로 출구 단계만.)
- [ ] 칩 클릭 → 기존 마무리 흐름(`forceEnd:true`)을 `FINISH_PHRASE_EXIT`로 호출.
- [ ] build → commit.

### Task 4: /api/readings resultReady + 내 고민톡 링크

**Files:** Modify `app/api/readings/route.ts`, `app/readings/page.tsx`

- [ ] GET: messages 조회에 `created_at` 추가, reading별 마지막 assistant `created_at` 수집. `STALE_RESULT_MS = 6 * 3600_000`. 응답에 `resultReady: ended || (consult && hasMsg && lastAssistantAt < now - STALE_RESULT_MS)`.
- [ ] 리스트: `canResume = !r.resultReady && r.ended === false` → href 분기를 `resultReady ? result : reading`으로. 공유 버튼 노출 조건(`!canResume`)도 `resultReady` 기준으로.
- [ ] build → commit.

### Task 5: result 페이지 "이어서 대화하기" 보조 버튼

**Files:** Modify `app/(consultations)/saju/result/page.tsx`, `app/tarot/result/page.tsx`

- [ ] 로드된 messages에서 `ended = assistant 중 [END] 포함 여부` 계산. `!ended`면 기존 CTA 아래 보조 버튼 "💬 이어서 대화하기" → `/saju/reading?id=…` / `/tarot/reading?id=…`.
- [ ] build → commit.

### Task 6: 정리요약 auto-END 규칙

**Files:** Modify `lib/claude.ts` (buildSystemMessage + buildTarotSystemMessage 공용 상수)

- [ ] 상시 규칙 블록 상수 추가 후 양쪽 dynamicPart에 포함:
  ```
  ### 정리 요청 = 마무리
  사용자가 대화의 정리/요약/마무리를 명시적으로 요청하면("정리해줘", "요약해줘", "마무리하자" 류)
  다른 모드 지시와 무관하게 이번 턴은 핵심 요약 + 그레이스풀 마무리로 닫고 맨 끝에 [END]를 단독 줄로.
  ```
- [ ] build → commit.

### Task 7: 검증 (일회성 스크립트 + 브라우저)

- [ ] dev 서버 재시작 (프롬프트 캐시 함정).
- [ ] 일회성 `qa/w3-verify.ts` (w7-verify 패턴): ① 첫 턴 응답 헤더 `x-wrap-mode: free` ② 다턴 진행으로 converge 전이 확인(또는 짧은 대화 + forceEnd로 hardcap) ③ 중간 턴에 "지금까지 얘기 정리해줘" → 응답 [END] 확인 ④ stale 판정: 테스트 리딩의 messages `created_at`을 service role로 7시간 전으로 UPDATE → `/api/readings` GET에서 `resultReady: true`.
- [ ] 브라우저: converge까지 대화 → 60초 방치 → 멘트+칩 → 클릭 → 결과 화면. 내 고민톡 stale 카드 → 결과 → "이어서 대화하기".
- [ ] 스크립트 삭제 → dev push → (검증 통과 시) main ff.
