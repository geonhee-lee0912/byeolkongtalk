# 시뮬 재진입 (재개 + 완료 재열람)

> 2026-08-09 브레인스토밍 확정. 보관함 시뮬 카드를 눌러 **해당 판으로 진입**하는 기능.
> 관련: [[p3a-sim-engine-progress]] · [[t1-ia-session-progress]]

## Goal

보관함(`/readings?tab=sim`) 시뮬 카드를 누르면 **그 판에 실제로 들어가야** 한다. 현재는 재진입 인프라가 없어 안전상 `/relationship` 허브로만 보낸다(08-09, 순진하게 `/relationship/sim`으로 링크하면 매번 새 판 생성 + SIM_COST 재차감 + 고아 판 → 그래서 막아둠). 이 인프라를 만들어:

- **진행 중(`phase==='stage'`) → 이어하기(재개)**: 기존 판으로 돌아가 대화를 계속. **재차감 없음.**
- **완료(`phase==='debriefed'`) → 재열람**: 인형과 나눈 **대화 전체(읽기전용)** + 저장된 **디브리핑(정리·보낼 말)**. 재생성 없음.

## 재진입이 가능한 근거 (현행 데이터 모델)

전부 DB에 저장돼 있어 새로 만들 필요 없음:

- **판** = `readings`(`consultation_type='relationship_sim'`, `saju_data`=`SimMeta{situationId, userContext, phase, sendMessage?}`, `relationship_id`, `stars_spent=SIM_COST`).
- **대화** = `messages`(`reading_id`):
  - 인형 대화 = `skill_key IS NULL` (user=내 발화 / assistant=인형).
  - 프레임 고지 = `skill_key='sim_note'` (판 생성 시 1건, 결정적 문자열).
  - 위기 복귀 = `skill_key='sim_note'` (user 발화 + assistant 별콩이).
  - **디브리핑 = `skill_key='sim_debrief'`** (완료 시 저장) + `saju_data.sendMessage`.
- chat 라우트(`say`/`suggest`/`debrief`)는 이미 **기존 `simReadingId` 위에서 동작**하고, `phase==='debriefed'`면 **409로 변경 차단**(서버측 read-only 보장). POST `/sim`(=차감)은 **새 판 생성 때만** 호출된다.

→ **재개 = 판을 다시 열어 chat 라우트로 계속(POST `/sim` 안 부름 = 차감 0). 재열람 = 저장 데이터 읽기전용 표시.** 08-09 재차감·고아판 버그가 구조적으로 불가능.

## 확정 결정 (브레인스토밍)

1. 진입점 = **기존 몰입 라우트 재사용** `/relationship/sim?sim=<readingId>` (별도 read-only 라우트 안 만듦).
2. 완료 재열람 = **대화 전체(무대 read-only 재현) + 디브리핑** 둘 다.
3. 재개는 **재차감 없음** — 턴캡·민감 게이트는 현행 그대로 적용.
4. 완료 판은 chat 라우트가 이미 409로 막으니 **서버측에서도 변경 불가**(안전 이중).

## 아키텍처

### 1. 신규 GET `/api/relationship/sim?id=<readingId>` (기존 route 파일에 `GET` 추가)

- 인증 + 소유권(`user_id===userId`, `consultation_type==='relationship_sim'`) — 아니면 404.
- 로드: reading(`saju_data`→meta), `relationships`(label·status·partner_profile_id), `situation`(getSituation), `messages`(created_at asc).
- **프레임은 결정적으로 재구성**(메시지에서 안 읽음): `buildSimFrame(relLabel, situationLabel)` 공유 헬퍼(아래 §4).
- 응답:
  ```ts
  {
    simReadingId: string;
    situationId: string;
    statusLabel: string;
    label: string;          // rel.label
    status: string;         // rel.status (NightStage status prop)
    phase: "stage" | "debriefed";
    frame: string;          // 재구성
    messages: { who: "user" | "doll" | "note"; text: string }[]; // 전사(프레임·디브리핑 제외)
    debrief: string | null;      // debriefed 면 sim_debrief 메시지 content
    sendMessage: string | null;  // meta.sendMessage
  }
  ```
- **메시지 매핑**(서버): created_at asc 순회, 각 행 `(role, skill_key, content)` →
  - `content===frame` (프레임 재구성 문자열과 동일) → **스킵**(프레임은 별도 반환).
  - `skill_key==='sim_debrief'` → `debrief` 로(전사에서 제외).
  - `role==='user'` → `{who:"user"}` (일반·민감 user 발화 공통).
  - `role==='assistant' && skill_key==='sim_note'` → `{who:"note"}` (위기 복귀).
  - `role==='assistant' && skill_key IS NULL` → `{who:"doll"}`.
- ⚠️ 구현 시 실제 컬럼·`SimMeta` 필드를 코드에서 확인(추정 금지). partner_profile_id 없는 레거시 판은 재열람만 허용(재개는 프로필 필요 — 판단은 플랜에서).

### 2. 시뮬 페이지 `?sim=` 로드 경로 (`app/relationship/sim/page.tsx`)

- 마운트 시 `params.get("sim")` 있으면 **로드 분기**(기존 `rel` 파라미터 신규 생성 분기와 배타):
  - GET 호출 → 실패(404 등) → `router.replace("/relationship")`.
  - 성공 → `rel`·`session`(simReadingId·frame·statusLabel) 세팅 + `loaded`(messages·debrief·sendMessage) 보관 + `phase="stage"`.
- 렌더 분기:
  - **`phase==='stage'`(진행 중)**: `NightStage`에 `initialMessages`(loaded.messages) 전달, **라이브**(readOnly=false). 이어하기 = 기존 chat 라우트. `onDebrief`→`phase="debrief"`→`SimDebrief`(생성, 현행).
  - **`phase==='debriefed'`(완료)**: `NightStage` `readOnly` + `initialMessages`(전사). 하단바=`🌙 정리 보기` 버튼만 → `onDebrief`→`phase="debrief"`→`SimDebrief` `initialDebrief/initialSendMessage`(프리로드, 재생성 안 함).
- 기존 신규 생성 흐름(`?rel=` → SituationSelect → StarConfirm → POST `/sim`)은 **불변**.

### 3. 컴포넌트

- **`NightStage`** (`components/relationship/sim/NightStage.tsx`):
  - `initialMessages?: { who: "user"|"doll"|"note"; text: string }[]` — 있으면 `messages` state 시드 + `started=true`(인형 접힘).
  - `readOnly?: boolean` — true면 하단 입력바(답변추천·입력창·전송) 숨기고 **`정리 보기` 버튼 하나**만(→`onDebrief`). say/suggest 비활성.
  - 기존 라이브 동작(초기값 미전달 시) 무변경.
- **`SimDebrief`** (`components/relationship/sim/SimDebrief.tsx`):
  - `initialDebrief?: string` + `initialSendMessage?: string | null` — 있으면 **마운트 fetch(생성) 스킵**하고 바로 `done` 렌더(재열람). 없으면 현행(action:debrief 생성).
- **DollPortrait/StageFrame/SimBubble/ByeolkongNote**: 변경 없음(재사용). `readOnly` 시 `SimBubble`의 👍👎 피드백은 숨김(완료 판 personality 변경 방지) — 플랜에서 확인.

### 4. 공유 헬퍼 — 프레임 결정적 재구성

- `lib/relationship/sim.ts`에 `buildSimFrame(relLabel: string, situationLabel: string): string` 추가.
- POST `/sim`(route.ts:99 인라인 문자열)을 이 헬퍼로 교체(동작 동일) → GET이 같은 문자열 재구성.

### 5. `renderSimCard` 링크 (`app/readings/page.tsx`)

- 현행 `href = r.relationshipId ? "/relationship?rel=..." : "/relationship"` (안전 허브) →
  **`href = "/relationship/sim?sim=" + r.id`** (그 판으로 재진입). 완료=재열람 / 진행 중=재개.
- 08-09 안전 주석(재차감·고아판)은 이 스펙으로 해소됐으니 갱신.

## 안전 / 과금

- 재개·재열람 모두 **POST `/sim` 미호출 = 차감 0**. GET·read-only.
- 완료 판은 chat 라우트가 `phase==='debriefed'` → 409 (say/suggest/debrief 전부 차단). 재열람 SimDebrief는 chat 라우트를 안 부르고 프리로드 데이터만 렌더.
- 재개 중 `suggest`(답변 추천)는 현행대로 `SIM_SUGGEST_COST` 차감(의도된 유료) — 재진입 자체는 무료.

## 스코프 밖

- 시뮬 판 삭제·아카이브 · 디브리핑 편집 · 전사 공유 · 새 상황으로 이어가기.
- 초상화 종합(P3b). 어드민 시뮬 지표(P3 후 일괄).

## 열린 세부 (구현 플랜에서 확정)

- `readOnly` NightStage 하단바 정확한 형태(정리 보기 버튼 위치·문구) — 실렌더 확인.
- 프로필 삭제된 레거시 진행 중 판 재개 가드(현행 POST는 `no_profile` 409) — 재개 GET/이어하기에서 어떻게 처리할지.
- `content===frame` 매핑이 위기 복귀 노트와 안 겹치는지(프레임 문자열 유일성) 실데이터 확인 — 안 되면 프레임 메시지에 마커.
