# Claude Sonnet 5 마이그레이션 노트

> 상태: **적용됨 (2026-07-04)**. `claude-sonnet-4-6` → `claude-sonnet-5` 전환 완료. `npx tsc --noEmit` 통과. dev 실사용 검증 권장(아래 "검증").

## 배경

- **Claude Sonnet 5** (`claude-sonnet-5`) — 2026-06-30 출시. Sonnet 4.6 의 다음 세대.
- 코딩·에이전트 태스크에서 4.6 대비 향상. 정가 $3/$15 (4.6 과 동일). **인트로 $2/$10 은 2026-08-31 까지**, 이후 정가.
- adaptive thinking 지원, `effort` 기본 `high`, 1M 컨텍스트, 128k max output. Priority Tier 만 미지원.

## 적용 내역 (무엇을 바꿨나)

### 1. 모델 ID 교체 (`claude-sonnet-4-6` → `claude-sonnet-5`)
- `lib/claude.ts` — `streamChat` (사주+타로 공용 프로덕션 스트림)
- `qa/config.ts` — `JUDGE_MODEL` (QA 심판; simulator 는 haiku 라 그대로)
- `AGENTS.md` — 스택 표기

### 2. adaptive thinking OFF 유지 (`thinking: {type:"disabled"}`)
- Sonnet 5 는 `thinking` 필드 없으면 adaptive **ON** 이 기본. `max_tokens`(=thinking+응답 총합)를
  thinking 이 잠식해 `[END]` 마커·리포트 JSON·심판 JSON 이 잘릴 위험 → 4.6 과 동일하게 OFF.
- 적용: `lib/claude.ts` streamChat 호출부, `qa/evaluate/judge.ts` 호출부.
- (품질 업그레이드로 thinking 을 켜고 싶으면 이 줄 제거 + max_tokens 추가 상향 후 실측.)

### 3. 새 토크나이저(+~30% 토큰) 보정 — max_tokens 캡 ×1.3
같은 글자가 ~30% 더 많은 토큰으로 잡혀, 캡을 그대로 두면 리포트가 짧아지고 잘림. 동일 분량 보존 위해 상향:
- `lib/claude.ts` — streamChat/generateOnce 기본 `2048 → 2660` (채팅 턴)
- `lib/fortune/types.ts` `MAX_TOKENS_BY_FORTUNE`:
  daily 2600→3380 · monthly 5000→6500 · saju_full 12000→15600 · tarot_daily 2048→2660 ·
  tarot_love/money/career/relation 4000→5200 · compat/compat_social 6000→7800
- `qa/evaluate/judge.ts` — `1500 → 2000`
- ※ "~30%" 는 문서상 추정치(내용따라 상이). dev 에서 실측 후 미세조정 여지.

## 가격 영향 — 재조정 불필요 (검토 완료)

- per-token 단가 동일. 토큰 30%↑ → **원가 30%↑ 지만 절대금액이 작아** 마진은 1~2%p 만 하락, 여전히 90%+.
  - 오늘의 운세 5별: 마진 ~93% → ~91%
  - 이번달 운세 15별: ~96% → ~95%
  - 2026 사주분석 50별: ~96% → ~95%
- 이 프로젝트 가격은 [value-based(원가는 제약 아님, 80%+ 마진 목표)](superpowers/specs/2026-06-03-pricing-rebalance-design.md) 라 80% 바닥 안 건드림 → **별 가격/패키지 재조정 불필요.**
- 즉 이슈의 무게중심은 "가격"이 아니라 위 **2·3 (thinking·토큰 캡)** 였고 그건 처리됨.

## 400 위험 점검 (안전)
- sampling(`temperature`/`top_p`/`top_k`)·수동 thinking(`budget_tokens`)·assistant prefill — **현 코드에 없음.**

## 신규: 실시간 사이버보안 세이프가드
- 위험 사이버보안 주제 요청은 거부 가능(HTTP 200 + `stop_reason:"refusal"`, 에러 아님). 사주/타로엔 사실상 무관.

## 검증
- [x] `npx tsc --noEmit` 통과
- [ ] dev 로그인 → 사주/타로 SSE 스트림 → `[END]` 정상 종료 + 결과 페이지 이동
- [ ] 운세 리포트(`generateOnce`) truncation 경고 로그 없음 + 분량 정상
- [ ] QA 하네스 1~2 케이스 → 심판 JSON 파싱 정상

## 출처
- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [What's new in Claude Sonnet 5](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5)
- [Introducing Claude Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5)
