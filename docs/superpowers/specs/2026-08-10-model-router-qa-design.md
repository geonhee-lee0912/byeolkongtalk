# 모델 라우터/어댑터 + QA 검증 설계 (2026-08-10)

"가격·분량·모델·페르소나 통합 재설계"의 모델 축. 입력값 = `2026-08-10-cost-unit-economics-findings.md`(단위경제·원가) + 모델 조사(메모리 `cost-unit-economics-2026-08-10`).

## 1. 배경·목표

- 데이터 분석 결론: API 원가가 매출의 절반~80%, 원가 지배자 = 타로 상담(sonnet-5). 서방 저가 모델(GPT-5 mini/nano·Gemini 3 Flash·Haiku 4.5)이 sonnet-5의 1/12~1/60.
- 사용자 방향: "성능 동급 저가 모델로 전 상품 전환 + 혼합 호출 구조(라우터)". 단 "성능 동급"은 QA 실측이 게이트.
- **이 spec의 목표**: ①모델 무관 어댑터/라우터 인프라를 짜서 ②후보 모델이 별콩이 화법을 유지하는지 QA로 검증할 수 있게 한다.

## 2. 스코프

**In**: 어댑터/라우터 구조(접근 A) · QA 실행 배선(로컬) · 판정 프로토콜.
**Out (후속)**: 상품별 최종 모델 배치 확정(QA 결과 후) · 프로바이더별 프롬프트 캐시 대응(배포 시) · dev/prod 배포 · 가격/분량 재조정 · 페르소나 재구현.

## 3. 설계 — 접근 A: `streamChat` 내부 어댑터 분리

### 3.1 어댑터 경계

`lib/claude.ts`의 `streamChat`은 이미 프로바이더 무관 경계를 가진다:
```
streamChat(systemMessage: {staticPart, dynamicPart}|string, messages, maxTokens, logCtx)
  → AsyncGenerator<string, stopReason>
```
마커(`[END]`/`[CARD]`) 파싱은 호출부(라우트)가 하므로 어댑터는 텍스트 조각만 흘리면 된다. 프로바이더별로 갈라지는 건 5가지뿐:

| 항목 | Anthropic (현재) | 어댑터가 흡수 |
|---|---|---|
| 모델 호출 | `anthropic.messages.stream({model, max_tokens, thinking, system, messages})` | 프로바이더 SDK 호출 |
| thinking off | `thinking:{type:"disabled"}` | GPT `reasoning_effort:"minimal"` / Gemini thinking budget 0 |
| SSE 파싱 | `content_block_delta.text_delta` → yield | OpenAI `choices[].delta.content` 등 |
| stopReason | `message_delta.stop_reason` | `finish_reason` 등 → 공통값 매핑 |
| 캐시 마킹 | `cache_control:{ephemeral,ttl:1h}` on staticPart | **QA 단계 생략**(품질만 봄), 배포 시 프로바이더별 대응 |

### 3.2 파일 구조

```
lib/claude.ts                    # streamChat = 공통 오케스트레이션(재시도·빈응답 가드·로깅) + 어댑터 dispatch
lib/claude/adapters/types.ts     # ProviderAdapter 인터페이스 + 공통 StopReason 타입
lib/claude/adapters/anthropic.ts # 현 로직 이관(기본, 무변경 동작 보장)
lib/claude/adapters/openai.ts    # GPT-5 mini/nano
lib/claude/adapters/gemini.ts    # Gemini 3 Flash
lib/claude/model-registry.ts     # model id → 프로바이더 매핑 + QA env 오버라이드
```

### 3.3 어댑터 인터페이스 (초안)

```ts
type StopReason = "end_turn" | "max_tokens" | "refusal" | "other" | null;
interface ProviderAdapter {
  // system 블록(정적/동적) + messages + maxTokens → 텍스트 스트림, 최종 stopReason.
  stream(args: {
    systemStatic: string; systemDynamic: string;
    messages: {role:"user"|"assistant"; content:string}[];
    maxTokens: number; model: string;
  }): AsyncGenerator<string, StopReason>;
  isRetryableError(err: unknown): boolean;   // 프로바이더별 에러 분류
}
```
`streamChat`은 `model`을 받아 registry로 어댑터를 고르고, **기존 재시도·빈응답·로깅 래퍼는 그대로** 어댑터 위에 씌운다(`isRetryableUpstreamError`는 어댑터 위임).

### 3.4 호출부 (5 라우트)

`streamChat`/`generateOnce`를 타는 곳: `tarot/chat` · `saju/chat` · `relationship/chat` · `relationship/sim/chat` · `fortune/create`(generateOnce). 각 라우트가 자기 상품의 `model`을 넘긴다(기본값 = 현 sonnet-5라 **미지정 시 무변경**). 상품별 배치는 QA 통과 후 이 인자로 실현.

⚠️ `sensitive.ts`(민감 2차 판정, haiku 직접 호출)는 **어댑터 대상 아님** — 안전 크리티컬이라 검증된 haiku 유지.

## 4. QA 환경·실행 (로컬)

- **로컬 dev 서버**(`npm run dev`, localhost:3000)를 `qa/` 하네스가 HTTP로 때린다. Vercel dev/prod 배포는 **안 건드림**.
- 모델 전환 = **env 오버라이드**(`QA_CHAT_MODEL=<model>`). registry가 이 값을 최우선으로 읽어 전역 오버라이드(QA는 한 모델씩 테스트라 상품별 불필요).
- 실행: 같은 케이스 세트를 sonnet-5(기준선) + 후보 각각 돌려 `qa/out/`에 저장.
- 필요 env: `OPENAI_API_KEY`·`GEMINI_API_KEY`를 `.env.local`(dev 리소스). 로컬 API 실비용 소액.
- 케이스: 기존 `qa/cases/{tarot,saju,relationship,gomintalk}` + `qa/sim`. ⚠️ sim은 doll_partner 페르소나(코어 미계승)라 별도 특성 — 판정 시 유의.

## 5. 판정 프로토콜

measure-persona 교훈(sonnet judge의 **절대적** 화법 위반 판정 실패)을 반영해 **pairwise 상대 비교**로 전환 + 안전장치.

1. **Opus 5 judge = pairwise 블라인드 A/B** — 같은 입력에 sonnet vs 후보 두 응답, 어느 쪽이 별콩이 화법(따뜻함·단정금지·흐름/가능성/선택·매턴질문금지)에 더 맞는지 + 이유. **라벨 숨김 + 위치 무작위**로 자기진영 편향 차단.
2. **객관 신호 병행** — `qa/evaluate/assertions.ts`의 하드 지표(`no_consecutive_question_close`·마커 준수·분량)는 judge 무관 자동 판정. (measure-persona가 인정한 신뢰 축)
3. **judge 캘리브레이션 먼저** — 착수 시 10~20 케이스를 judge + 육안 둘 다 판정해 일치율 확인. 낮으면 judge 프롬프트 보정 or 육안 비중↑. judge 맹신 방지.
4. **육안 = 표본만** — judge 애매/역전 케이스 + 무작위 N개. 전수 아님.

judge 모델 = Opus 5($5/$25, 케이스 수십 개라 소액). Fable 5는 오버킬.

## 6. 후보 모델 (서방 4, 중국 제외)

GPT-5 mini($0.125/$1) · GPT-5 nano($0.05/$0.40) · Gemini 3 Flash($0.25/$1.5) · Haiku 4.5($1/$5). 기준선 Sonnet 5($3/$15). ⚠️단가 배포 시 재확인.

## 7. 성공 기준

- 어댑터 도입 후 **model 미지정 시 현 동작 무변경**(anthropic 어댑터 회귀 0) — 기존 QA 케이스가 sonnet-5로 그대로 통과.
- 후보 모델별 QA 실행 → `qa/out/` 결과 + pairwise 판정표 산출.
- 상품별로 "sonnet 동급 이상" 후보 식별(없으면 sonnet 유지 = 유효한 결론).

## 8. 리스크

- **자기진영 편향**(Opus가 Claude 편애) → 블라인드+위치 무작위.
- **judge 신뢰** → 캘리브레이션 게이트.
- **어댑터 회귀** → anthropic 어댑터는 현 로직 그대로 이관, 기존 QA로 회귀 확인.
- **캐시 미대응 원가 왜곡** → QA는 품질만 보고 원가는 조사값 사용. 캐시는 배포 스코프.

## 9. 비스코프·후속

상품별 배치 확정 · 프로바이더별 캐시 · 배포 · 가격/분량 재조정 · 페르소나 재구현(모델 교체 시 새 PROMPT_VERSION 코호트)은 QA 결과 확인 후 별도.
