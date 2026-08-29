# 운세 리포트 luna 전환 + 구조화 출력 (design)

2026-08-29 · 상태: 설계 승인 → 스펙 리뷰 대기

## 한 줄

유료 운세 리포트 5종 + 사주 chat resume 를 `claude-sonnet-5` → `gpt-5.6-luna`(OpenAI) 로 이관하고, 활성 JSON 리포트 4종은 OpenAI 구조화 출력(`response_format: json_schema` strict)으로 "report parse failed" 클래스를 구조적으로 제거한다. **dev only** (prod 는 로드맵 ④ 배치).

## 배경 · 왜

- **현행 티어링**: chat(타로·연애·시뮬)=luna · 무료 데일리(daily/tarot_daily)=nano · **유료 리포트 전부 + 사주 chat resume 만 sonnet**. (`lib/fortune/model.ts` `fortuneModel`, `lib/claude/model-registry.ts` `DEFAULT_CHAT_MODEL`.)
- **원가**: luna 는 타로에서 품질 확인됨(오히려 sonnet 보다 길게 씀) + 원가 ~1/13 (luna $0.20/$1.20 vs sonnet $3/$15). 리포트가 sonnet 원가의 상당분 — `cost-unit-economics-2026-08-10`.
- **파싱 실패**: `/api/fortune/create` "report parse failed" 가 monthly 2회(08-08·08-21)·compat 절단 1회(08-28) 재발. 근본원인 = 모델의 형식위반 JSON(누락 `]`·중복 키·절단). 사후 텍스트 복구(`lib/fortune/json-recover.ts`)는 매 재발마다 새 형태라 두더지잡기. **근본 처방 = provider 구조화 출력** — 사후 복구 확장 금지. `fortune-report-parse-failure`.
- **결정(사용자 2026-08-21)**: 구조화 출력을 단독으로 하지 않고 **luna 이관 작업과 묶어서** 처리. 2026-08-29 사용자가 순서를 앞당김(사주-MBTI 상세화면 개선보다 먼저) + 범위를 "관련된 것 전부"로 확정.

## 스코프

### 대상 (sonnet → luna)

- **유료 리포트 5종**: `saju_full` · `monthly` · `compat` · `compat_social` · `good_days`
- **사주 chat resume**: `/api/consultations/saju/chat` — 현재 `streamChat(...)` 에 model 미지정 → sonnet 디폴트(`route.ts:255`). 이게 유일한 sonnet chat 홀드아웃(타로·연애·시뮬은 이미 `CHAT_MODEL`).
- **inactive 타로 리포트 4종** (`tarot_love`/`tarot_money`/`tarot_career`/`tarot_relation`): `fortuneModel` 규칙("무료 daily 외 전부 luna")상 **자동으로 luna 행** — 별도 코드 0.

### 구조화 출력 (json_schema strict) 대상

- **활성 JSON 리포트 4종만**: `saju_full` · `monthly` · `compat` · `compat_social`
- `good_days`: 마크다운(파싱 없음, create 라우트에 파싱 분기 없음) → **모델 스왑만**
- 사주 chat: 대화형 산문 스트리밍 → **모델 스왑만**
- inactive 타로 4종: 스키마 **안 만듦(YAGNI)** — 실호출 0. 🔴 **규칙: 타로 리포트 재활성(`active:true`) 시 `json_schema` 추가 필수** (없으면 luna 형식위반 리스크에 노출). shape 는 이미 `lib/fortune/tarot-report.ts` 에 있어 그때 비용 작음.

### 아웃 (이번 작업 아님)

- prod 배포 — 로드맵 ④ dev 누적분 배치
- 무료 daily/tarot_daily (이미 nano)
- 분량·가격 정책 재설계 본체(`pricing-length-redesign-progress`) — 여기선 **luna 밴드 재정합**만
- json-recover 로직 확장 — 구조화 출력이 대체

## 설계

### ① 모델 라우팅

- `lib/fortune/model.ts`: 신규 상수 `FORTUNE_REPORT_MODEL = "gpt-5.6-luna"`. `fortuneModel()` = `daily`/`tarot_daily` → `FORTUNE_CHEAP_MODEL`(nano), 그 외 전부 → `FORTUNE_REPORT_MODEL`. (chat 과 우연히 같은 luna 지만 의미가 달라 별도 상수 — 미래 분기 여지.)
- 사주 chat: `app/api/consultations/saju/chat/route.ts:255` `streamChat(...)` 호출에 5번째 인자 `CHAT_MODEL` 추가. (착수 시 이 라우트 내 streamChat 호출이 1곳인지 재확인 — 현재 grep 1곳.)

### ② 어댑터 계약 확장

- `lib/claude/adapters/types.ts` `AdapterStreamArgs` 에 옵셔널 필드 추가:
  `responseFormat?: { name: string; schema: object }`
- `lib/claude.ts`:
  - `generateOnce(system, messages, maxTokens, logCtx, model, responseFormat?)` — 6번째 옵셔널 인자.
  - `streamChat(...)` 도 동형 6번째 인자, `adapter.stream({ ..., responseFormat })` 로 전달.
  - 재시도·빈응답 가드·로깅은 기존대로 래퍼가 소유(변경 없음).
- `lib/claude/adapters/openai.ts`: `responseFormat` 이 있으면 `chat.completions.create` 에
  `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` 주입. **`stream: true` 와 병행 가능** — 조각을 누적하면 유효 JSON.
- `anthropic`/`gemini` 어댑터: `responseFormat` 무시(계약상 옵셔널). 이관 후 리포트는 openai 로만 가지만, 만약 sonnet 폴백(`DEFAULT_CHAT_MODEL`)으로 라우팅돼도 **프롬프트-JSON + 파서**로 우아하게 degrade.

### ③ 리포트별 스키마

- 스키마 원천 = 기존 AI 인터페이스: `SajuFullReportAI`(saju-full-report.ts) · `MonthlyReportAI`(monthly-report.ts) · `CompatReportAI`(compat-report.ts, compat/compat_social 공유). 각 리포트 모듈에 `X_REPORT_SCHEMA` **co-locate**(인터페이스·파서 옆 = 동기화 쉬움).
- strict 모드 규칙: **전 필드 `required`** + 모든 object 에 `additionalProperties: false` + 중첩 object 동일. 배열은 `items` 스키마만(strict 모드가 `minItems`/`maxItems` 를 강제 못 하므로 개수는 아래 파서가).
- 🔴 **기존 `parseXReportJson` 은 2차 검증으로 유지** — 개수 규칙(monthly 12개월·actions 3개·supplements 2~4개 등)과 trim/정규화는 스키마가 못 하니 파서가 계속 담당. 즉 **스키마 = 구문·shape 보장 / 파서 = cardinality·정규화**. 1회 재시도(route)도 유지 = 벨트+멜빵.

### ④ max_tokens / 밴드 재정합

- 🔴 **구조화 출력은 `max_tokens` 절단을 막지 못한다** — luna 가 길게 써서 캡을 넘기면 절단된 불완전 JSON → 스키마와 무관하게 실패. 따라서 밴드 재정합은 여전히 필수.
- `scripts/fortune-length-probe.ts` 를 **luna 로** 리포트별 실행(⚠️TRUNCATED 플래그, 변동폭 크니 여러 번) → `MAX_TOKENS_BY_FORTUNE`(lib/fortune/types.ts) 캡을 실측 꼬리 위로.
- 커밋 안 된 compat/compat_social `14000`(2026-08-28 sonnet 기준 절단 핫픽스)도 luna 기준 재확인 대상.

### ⑤ 계측 + 코호트

- `app/api/fortune/create/route.ts` `failGeneration`: 최종 실패 시 **재시도(retry) raw 도 로깅** — 현재는 attempt1 의 `report` raw(rawHead/rawTail)만 남아 실제 실패한 재시도 원문이 미기록(`fortune-report-parse-failure` 지목 갭).
- 모델 교체이므로 `PROMPT_VERSION`(lib/prompt-version.ts) 코호트 bump — 사후 이탈·원가 관측 분리.

## 검증

### 0단계 — 카나리아 (게이팅, 먼저)

- `gpt-5.6-luna` 가 `response_format: json_schema`(strict) 를 실제로 수용하는지 최소 스모크(작은 스키마 1개, 실 API). "설정을 읽어 판정 금지, 찔러서 확인"(`verify-by-exercising-not-reading`).
  - **수용** → 위 설계(Approach 1) 그대로.
  - **거부(json_object 만 지원)** → 폴백: `response_format: { type: "json_object" }` + 파서 유지(구문 유효성은 보장, shape 는 파서가). ②③ 이 지점만 분기, 나머지 설계 불변.

### 리포트별 (4 JSON + good_days)

- JSON E2E: 생성 → 파싱 → 저장까지 무실패(구조화 대상 4종).
- 톤: 별콩이 fortune 페르소나 정합(`data/persona/byeolkong_fortune.md`) — 회귀 없나.
- 분량: luna 밴드(④ 재정합 후).
- good_days: 마크다운 + "향후 30일 목록 밖 날짜 지어내기 금지" 규칙을 luna 가 지키는지(구조화 아님).

### 사주 chat

- 대화 페르소나 QA — 타로·연애 luna QA 와 동형(QA 하네스). 저트래픽(resume 전용)이나 톤 확인.
- ⚠️ 착수 시 확인: 리포트 전용 QA 하네스 유무(chat 하네스 `qa/run.ts` 는 chat 용). 없으면 length-probe + 표본 육안.

## 배포

- **dev only.** prod(main)은 로드맵 ④ dev 누적분 한 판 배치. 사용자가 prod Vercel `OPENAI_API_KEY` 이미 보유(2026-08-14 chat 전환 때) — 리포트도 openai 라 추가 env 0.

## 리스크 · 미해결

- **luna json_schema 미지원** → 폴백(0단계서 판별). 설계 분기점 명시됨.
- **절단 재발** → 밴드 재정합으로 완화. probe 변동폭 크니 캡에 마진.
- **톤 회귀** → QA 게이트. 모델 교체는 `persona-tuning-pendulum`/`measure-persona-by-reading-not-matching` 함정 주의(읽기 > judge).
- **사주 chat resume 스레드 혼종**: 옛 sonnet 메시지 + 새 luna 메시지 = 무해(모델은 이전 작성자 무관).
- **미해결**: 리포트 QA 하네스 유무(착수 시 확인).

## 참고

- 파일: `lib/fortune/model.ts` · `lib/claude.ts`(generateOnce/streamChat) · `lib/claude/adapters/{types,openai}.ts` · `lib/fortune/{types,saju-full-report,monthly-report,compat-report,tarot-report,json-recover}.ts` · `app/api/fortune/create/route.ts` · `app/api/consultations/saju/chat/route.ts` · `scripts/fortune-length-probe.ts` · `lib/prompt-version.ts`
- 메모리: `fortune-report-parse-failure` · `model-router-qa-progress` · `cost-unit-economics-2026-08-10` · `product-backlog`#6 · `pricing-length-redesign-progress`

## 실행 결과 (2026-08-29, dev 완료)

- **0단계 카나리아 ✅** — `gpt-5.6-luna` 가 스트리밍에서 `json_schema strict` 수용·스키마대로 유효 JSON 반환 확인 → primary(strict) 경로 확정(폴백 불요).
- 🔴 **스코프 확장 (실행 중 발견 + 사용자 승인)** — 스펙 초안의 "사주 chat = 유일한 sonnet chat 홀드아웃" 은 **틀렸다**. streaming 만 봤고 `generateOnce` 원샷 3표면을 놓쳤다: ① relationship **우리궁합 스킬**(`app/api/relationship/chat/route.ts` — `buildFortuneSystem("compat")`+`parseCompatReportJson`, /fortune/compat 과 동일 리포트) ② 시뮬 **답변추천** ③ 시뮬 **디브리핑**(둘 다 `app/api/relationship/sim/chat/route.ts`). 셋 다 model 미지정 → `DEFAULT_CHAT_MODEL`(sonnet). 사용자 "전부 통일" 결정으로 **셋 다 luna 이관**: 우리궁합 = `fortuneModel("compat")`+`fortuneResponseFormat("compat")`(luna+구조화출력, 같은 `COMPAT_REPORT_SCHEMA`) / 시뮬 2종 = `CHAT_MODEL`(텍스트라 구조화 없음). 결과: **app/ 의 모든 streamChat=CHAT_MODEL, 모든 generateOnce=model 인자 → sonnet 홀드아웃 0**(summarizeOlder haiku 는 설계상 유지).
- **밴드 재정합 (luna 실측, 프로덕션 경로 프로브 2회)** — 5종 전부 parse=OK. 실측 산문: monthly ~3740 · compat ~4035 · compat_social ~3577 · good_days ~5150 · saju_full ~7350자. **good_days 6500→8500**(luna 가 sonnet 대비 ~63% 길어짐 + 마크다운이라 절단 무증상). compat/compat_social **14000 확정**(2026-08-28 sonnet 핫픽스값 유지 — luna 엔 과하나 무해). monthly 6500·saju_full 15600 마진 충분(불변). ⚠️ 전면 분량·가격 재설계는 별도 브레인스토밍으로 이관(여긴 luna 안전 마진만).
- **검증** — 유닛 453/453 · tsc 0 · next build 0. subagent-driven(유닛별 스펙+품질 리뷰 전부 통과) + **최종 종합 리뷰 SHIP-READY(dev)**. 구조화 출력 경로 E2E 무결·compat 두 진입점 동일 스키마 확인.
- **커밋** `dc9dd04`..`d4cac5d` (12개, dev). PROMPT_VERSION=`2026-08-29-fortune-luna`. 마이그레이션 0·새 env 0. **prod(main)=로드맵 ④** — 배포 전 dev 에서 리포트 톤 육안 + `error_logs` `*_parse`/`hit max_tokens` 모니터.
