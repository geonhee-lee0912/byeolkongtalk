# 전환 순간 만들기 — C3 (인챗 업셀) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대화를 떠나지 않는 확장 2종 — 추가 카드(clarifier ⭐10, 타로 전용, 대화당 2회) + 대화 연장(⭐10 +4턴, 대화당 1회) + 잔액 부족 시 인챗 충전 시트(토스 결제 → returnTo 복귀 → pending_upsell 원클릭 재개).

**Architecture:** C2의 [RECO:] 마커·칩 인프라 재사용 — 인챗 전용 product 2종(`tarot:clarifier`, `extend`) 추가 (next_reco 저장 대상 아님). 서버가 한도·차감을 강제(spend_stars RPC, readingId·source 기록), 임계치는 chat 라우트가 reading의 `extra_turns`·`clarifier_count`로 보정. 드로우는 기존 CardDrawRitual(slim 모드)을 바텀시트에 재사용.

**Spec:** [2026-07-13-conversion-moment-design.md](../specs/2026-07-13-conversion-moment-design.md) 변경 ⑥ + 화면 이동·복귀 전략 + clarifier 시트 구성.

---

## 계약

- **가격**: clarifier ⭐10 / extend ⭐10 (+4턴). 상수는 `lib/upsell.ts` 단일 정의 (`CLARIFIER_COST=10, CLARIFIER_MAX=2, EXTEND_COST=10, EXTEND_TURNS=4, EXTEND_MAX=1`).
- **마커**: `[RECO:tarot:clarifier]` (타로 페르소나가 미해결 매듭/더뽑기 신호에서 제안 시), `[RECO:extend]` (claude.ts convergeLast 가이드가 조건부 지시 — 페르소나 아님). **인챗 전용** — chat 라우트의 next_reco 저장에서 제외.
- **임계치 보정**: 유효 임계치 = 기본 + `extra_turns`(연장) + `clarifier_count × 2`턴/`× 800`자 — convergeStart/hardCap/absTurnCap 모두에 가산.
- **선택권**: 칩은 별콩이 제안 발화에 앵커, 가격은 칩만 표기(별콩이 발화 금지), 거절 시 재조르기 없음.
- **차감 실패(insufficient)**: 충전 시트 오픈 → 결제 → returnTo 복귀 → `byeolkong:pending_upsell` 복원 확인 → 원클릭 재개.

### Task 1: 마이그레이션 + lib/upsell.ts
- `supabase/migrations/20260713010000_readings_upsell.sql`:
```sql
-- C3 인챗 업셀: 대화 연장(+4턴/구매) 및 보조 카드(clarifier) 횟수 — 수렴 임계치 보정용.
ALTER TABLE readings ADD COLUMN IF NOT EXISTS extra_turns INT NOT NULL DEFAULT 0;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS clarifier_count INT NOT NULL DEFAULT 0;
```
- `lib/upsell.ts` (신규): 위 상수 5개 export.
- 커밋 `feat(db): extra_turns·clarifier_count + lib/upsell 상수 (C3)`

### Task 2: reco-utils enum 확장 (인챗 전용 product)
- `lib/reco-utils.ts`: `RecoProduct`에 `"tarot:clarifier" | "extend"` 추가, `RECO_PRODUCTS`에 포함(마커 파싱 대상), 신규 `INCHAT_ONLY_PRODUCTS = ["tarot:clarifier", "extend"]` export. `RECO_DISPLAY`에 두 항목 추가 (label: "카드 한 장 더 뽑기"/"별콩이랑 더 얘기하기", target은 "inchat" 리터럴 — 기존 target 유니온 확장).
- 두 chat 라우트의 마커→next_reco 저장부: `INCHAT_ONLY_PRODUCTS` 포함 마커는 **저장 생략** (칩 전용).
- C2 인라인 카드(RecoInlineCard 분기)가 이 product들을 받으면 렌더하지 않게 가드 (Task 6에서 전용 칩으로 대체).
- 빌드 + 커밋 `feat(reco): 인챗 전용 product 2종 (C3)`

### Task 3: 업셀 API 2개
- **`app/api/consultations/tarot/clarifier/route.ts`** (신규 POST): body `{readingId, card: {card_id, direction}}` → 세션 user + reading 소유권 + `consultation_type='tarot'` + [END] 없음 + `clarifier_count < CLARIFIER_MAX` + card_id가 기존 drawn_cards에 없음 검증 → `spendStars(user, CLARIFIER_COST, readingId, "clarifier")` (insufficient면 402 `{reason:"insufficient", balance}`) → `drawn_cards`에 `{position: 기존길이, label: "보조 카드", card_id, direction}` append + `clarifier_count+1` UPDATE → 200 `{drawnCards, clarifierCount}`.
- **`app/api/readings/[id]/extend/route.ts`** (신규 POST): 소유권 + [END] 없음 + `extra_turns < EXTEND_TURNS*EXTEND_MAX` 검증 → `spendStars(user, EXTEND_COST, readingId, "extend")` (insufficient→402) → `extra_turns += EXTEND_TURNS` → 200 `{extraTurns}`.
- 실패 롤백: spend 성공 후 UPDATE 실패 시 로그(수동 보정) — 기존 continue 라우트의 롤백 관례 확인해 따름.
- 빌드 + 커밋 `feat(api): clarifier·extend 업셀 라우트 (C3)`

### Task 4: 임계치 보정 (두 chat 라우트)
- reading 로드 시 `extra_turns, clarifier_count` 포함 → 유효 임계치 계산 후 기존 wrap 계산에 주입:
  - 타로: `const bonusTurns = reading.extra_turns + reading.clarifier_count*2; const bonusChars = reading.clarifier_count*800;` → `WRAP_THRESHOLDS[spread]` 복사본의 convergeStartTurn/hardCapTurn/absTurnCap에 +bonusTurns, chars에 +bonusChars.
  - 사주: `SAJU` 상수 기반 동일 보정 (clarifier는 0이지만 extend 적용).
- **convergeLast 조건부 [RECO:extend] 지시**: `buildTarotSystemMessage`/`buildSystemMessage` ctx에 `extendAvailable: boolean` 추가 (라우트가 `extra_turns === 0 && !forceEnd` 로 산출) → `convergeLastGuide`에 조건부 블록:
```
${ctx.extendAvailable ? `\n- 이번 턴 응답에 "여기서 정리해도 되고, 더 풀고 싶으면 이어서 볼 수도 있어" 결의 한 문장을 자연스럽게 녹이고, 응답 맨 끝에 [RECO:extend] 마커를 단독 줄로 붙여. 가격·별 언급 금지.` : ""}
```
- 빌드 + 커밋 `feat(chat): 업셀 임계치 보정 + convergeLast [RECO:extend] 지시 (C3)`

### Task 5: 타로 페르소나 — clarifier 제안 + 변경① 3갈래
- `data/persona/byeolkong_tarot.md`:
  1. "더 보고 싶다" 섹션 경로 안내를 3갈래로 (스펙 변경① C3 버전): 최우선 "이 대화에서 바로 한 장 더 — '이 매듭, 카드 한 장 더 펼쳐서 볼 수 있어' + 응답 맨 끝 `[RECO:tarot:clarifier]` 단독 줄" / 기존 이어가기 / 새 상담.
  2. 신규 문단 (같은 섹션 안): 유저가 명시적으로 안 물어도 **미해결 매듭이 또렷할 때** 별콩이가 먼저 1회 제안 가능 — 같은 마커, 대화당 제안 1회, 거절(무반응) 시 재제안 금지, 가격 금지.
- 커밋 `feat(persona): clarifier 제안 + 더보고싶다 3갈래 (C3)`

### Task 6: UI — 칩 2종 + ClarifierSheet
- **칩 분기**: 리딩 페이지의 마커 감지부(C2 recoAttach)가 product별 분기: cross-type→RecoInlineCard(기존), `tarot:clarifier`→ClarifierChip("🃏 카드 한 장 더 뽑기 ⭐10"), `extend`→ExtendChip("💬 별콩이랑 더 얘기하기 ⭐10 · +4턴"). 여러 마커 각각 앵커 (clarifier와 cross-type이 다른 턴에 공존 가능 — 각자 1개 제한 유지).
- **ClarifierChip 탭** → `ClarifierSheet` (신규, 바텀시트 — ContinuationModal 포털 패턴 + spec §clarifier 시트 구성):
  - 한 줄 메시지("마음 가는 카드 한 장만 더 골라줘") + "뽑는 순간 ⭐10 · 지금 카드들과 이어서 봐줄게" + 잔액 표시
  - **CardDrawRitual 재사용**: `cardCount=1`, `slotLabels=["+1"]`, `completeLabel="카드 선택 · ⭐10"`, 신규 props `slim?: boolean`(호흡 pill·디바이더·프로필 숨김)과 `excludeCardIds?: number[]`(이미 뽑힌 카드 제외 — shuffleDeck 결과 필터) 추가
  - onComplete → POST clarifier API → 성공: 시트 닫기 + 로컬 drawnCards 갱신 + **synthetic user 턴 자동 전송** ("방금 카드 한 장을 더 뽑았어. 같이 봐줘") → 별콩이가 새 [CARD:n]으로 해석 (chat 라우트는 DB에서 갱신된 drawn_cards 로드 — 이미 per-request 로드인지 확인, 아니면 로드 추가)
  - 402 insufficient → RechargeSheet 오픈 (Task 7)
  - shallow pushState로 OS백=시트 닫기
- **ExtendChip 탭** → 확인 없이 바로 POST extend (소액·비파괴) → 성공: 칩을 "✓ 이어가는 중" 상태로 전환 + 대화 계속 / 402 → RechargeSheet.
- 빌드 + 커밋 `feat(reading): clarifier·extend 칩 + ClarifierSheet (C3)`

### Task 7: 인챗 충전 시트 + returnTo 복귀 + pending_upsell
- **`components/upsell/RechargeSheet.tsx`** (신규): 바텀시트 — 잔액 + "충전하면 이 대화로 바로 돌아와요" + `STAR_PACKAGES`(lib/constants) 목록 + CTA.
- **결제 연결**: `app/shop/page.tsx`의 requestPayment 흐름(행 ~255-261) 확인 → 결제 시작 로직을 훅/유틸로 추출(`lib/use-toss-payment.ts` 류)해 시트에서 직접 호출. successUrl/failUrl에 `returnTo=<현재 reading URL>` 쿼리 추가.
- **/shop confirm 후 복귀**: shop 페이지의 confirm 성공 처리(행 ~137)에서 `returnTo` 쿼리 있으면 `router.replace(returnTo)` (검증: 내부 경로 `/`로 시작 + `//` 차단 — 기존 auth open-redirect 방지 관례 재사용).
- **pending_upsell**: 시트에서 결제 시작 전 `sessionStorage byeolkong:pending_upsell = {readingId, type:"clarifier"|"extend"}` → 리딩 페이지 마운트 시 감지 + 잔액 충분하면 확인 배너("충전 완료! 이어서 뽑을까?" / "이어갈까?") → 원클릭으로 해당 칩 액션 재실행, 소비 후 삭제.
- 빌드 + 커밋 `feat(upsell): 인챗 충전 시트 + returnTo 복귀 + pending_upsell (C3)`

### Task 8: prompt_version + 검증 + push
- `PROMPT_VERSION = "2026-07-13-conversion-c3"` (히스토리 추가).
- API 레벨 검증 스크립트(1회용, 커밋 안 함): 테스트 유저로 reading 생성 → clarifier POST(정상/한도 초과/카드 중복/insufficient) + extend POST(정상/2회째 거절) 단언. QA 하네스: `npm run qa -- --case=more_cards` 재런 — 3갈래 응답에 [RECO:tarot:clarifier] 방출 확인 (**dev 서버 재시작 필수** — 페르소나 캐시).
- `npm run build` → push → Supabase 마이그레이션 SUCCESS 확인.
- 커밋 `chore(prompt): c3 스탬프`

---

## Self-Review
- 스펙 ⑥-a(트리거·차감·임계치+2턴/800자·2회 제한) = Task 1·3·4·5·6 / ⑥-b(+4턴·마무리 턴 1회·톤 안전장치) = Task 1·3·4·6 / 충전 복귀(시트·returnTo·pending_upsell·실패 시 유지) = Task 7. 인챗 전용 마커의 next_reco 오염 방지 = Task 2.
- 사주 clarifier 없음(카드 없음) — 의도. 사주 extend는 지원 (Task 4 보정 + convergeLast 지시가 사주 빌더에도).
