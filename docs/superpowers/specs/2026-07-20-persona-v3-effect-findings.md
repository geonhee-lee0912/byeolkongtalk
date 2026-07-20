# persona-v3 효과 판정 — Findings (c3 → v3)

**작성일**: 2026-07-20
**데이터**: prod (Management API 직접 쿼리, `scripts/run-prod-query.mjs`). 제외 6명 반영(`9ff43266`·`b9e5dd5a`·`7f83a4d7`·`a3bcc2c7`·`3d648ebe`·`d8fdcdd0`).
**맥락**: 오늘(2026-07-20) 사이클 1~3 prod 일괄 배포(`75340d2`) 직전, 광고 신규 유입으로 코호트 섞이기 전 v3 판정. `PROMPT_VERSION`은 아직 `2026-07-17-persona-v3`(오늘 배포는 구조/가격 변경이라 버전 미변경) → v3 창 = 07-17~07-20이 깨끗한 "after".
**선행**: [[persona-tuning-baseline]] (07-12 baseline + 코호트 방법론) · `2026-07-16-paywall-funnel-extension-findings.md`

> **한 줄 요약**: persona-v3(당기는 별콩이)는 **대화 품질 축에서 명백히·크게 작동** — 질문마무리 74.5%→35.8%(반토막), 결과열람 46%→56%, 수렴 턴 5.40→4.90. 전환도 6.6%→11.6%(거의 2배)로 올랐고, 관계의도 태그(~82%, 양 코호트 동일) 안에서도 7.9→11.8% 유지 → traffic-mix 교란은 intent 축에서 대부분 배제(persona 귀속 신뢰도↑, 표본 얇음). 리텐션은 여전히 ~0(구조적 부채, persona 밖).

## 코호트 (readings.prompt_version, saju/tarot 상담)

| 코호트 | 리딩 | 유저 | 기간 |
|---|---|---|---|
| pre-2026-07-12 | 58 | 50 | 07-08~12 |
| 2026-07-12-persona-tuning | 21 | 20 | 07-12~13 |
| **2026-07-13-conversion-c3** (before) | 96 | 91 | 07-13~17 |
| **2026-07-17-persona-v3** (after) | 126 | 112 | 07-17~20 |

인접 비교 c3 vs v3 = 창 길이(3~4일) + 표본(96/126) 균형 → 시간 편향 최소.

## 1. 대화 품질 — 명백한 개선 ✅

| 지표 | c3 | v3 | Δ |
|---|---|---|---|
| **질문마무리 밀도** (assistant msg 물음표 종료 %) | 74.5% | **35.8%** | 반토막 |
| 결과 열람율 (result_viewed_at not null) | 46% | **56%** | +10pp |
| 평균 유저 턴 | 5.40 | 4.90 | 수렴 효율↑ |
| 인챗 clarifier 합 | 0 | 7 | 첫 발화 |

- 질문마무리 급감 = v3 핵심 설계(매 턴 질문 폐지·마무리 3택·소신 화법·turnSignals)가 prod에서 강하게 작동.
- **짧아졌는데(턴↓) 결과열람은 올랐다(↑)** = 이탈이 아니라 결단력 있는 수렴. 세 지표 인과 정합.
- ⚠️ 질문마무리 프록시 = `regexp_replace(content,'\s*\[[^\]]*\]\s*$','') ~ '\?\s*$'` (트레일 마커 제거 후 물음표 종료). QA의 `no_consecutive_question_close` 객관단언과 방향 일치([[qa-harness-usage]]).

## 2. 비즈니스 — 전환↑(교란 있음), 리텐션 불변

유저 단위(첫 상담 prompt_version으로 귀속), 결제 `status='completed'`:

| 코호트 | 유저 | 전환 | 전환율 | 매출 | 리텐션(2일+) |
|---|---|---|---|---|---|
| pre-07-12 | 50 | 4 | 8.0% | ₩8,900 | 0 |
| persona-tuning | 20 | 2 | 10.0% | ₩2,000 | 0 |
| c3 | 91 | 6 | 6.6% | ₩12,700 | 1 |
| **v3** | 112 | 13 | **11.6%** | **₩31,500** | 1 |

- **전환 6.6%→11.6%(거의 2배), 매출 2.5배.** v3가 관찰기간 최단인데 전환 최고 → 창 편향(옛 코호트 유리)을 이기고 상승 = 방향은 robust.
- ✅ **교란 검증 (emotion_tag 층화, 2026-07-20 추가)**: 감정태그 믹스 c3/v3 거의 동일 — 관계의도 "그 사람 마음이 궁금해" **82.3%→81.0%**(관계 유입 쏠림 없음, 오히려 미세↓). **지배 태그 안에서** 전환 **7.9%(6/76)→11.8%(11/93)**, other도 0→10.5% → **intent 축 traffic-mix 교란 대부분 배제, 전환 상승은 persona/상품 귀속**. ⚠️잔여: (a) 표본 얇음(전환자 6→11, CI 넓음) (b) 층 안 utm_content(광고소재) 미통제 (c) 관측연구라 100% 단독 인과 증명은 한계(단 창 내 구조 불변→persona-v3가 주 변화).
- **리텐션 여전히 ~0** (1/112). persona로 안 고쳐짐 — 복귀통로(알림·무료훅 = W5) 인프라 문제. 3주째 재방문 0 숙제 그대로.

## 3. 판정

- **대화 품질 = 확실히 YES.** 설계 의도(덜 캐묻고 소신) 그대로 작동, 완료율까지 견인.
- **전환 = 강한 positive, intent-층화로 traffic-mix 교란 대부분 배제** → persona/상품 귀속 신뢰도↑ (단 표본 얇음·utm 미통제).
- **리텐션 = 불변, persona 범위 밖** → 오늘 배포한 연애 상담(패스/체크인)이 리텐션 엔진. **다음 판정 핵심 지표 = 패스 갱신율·체크인 복귀율**(`/admin/relationship`).

## 4. 재현 (쿼리)

- 코호트 규모: `readings GROUP BY prompt_version WHERE consultation_type IN ('saju','tarot')`
- 세션 지표: `readings ⨝ (messages: role별 count) GROUP BY prompt_version`, result_viewed_at/extra_turns/clarifier_count 집계
- 질문마무리: assistant messages 트레일 마커 제거 후 `~ '\?\s*$'` 평균
- 전환/리텐션: 유저→첫 readings prompt_version 귀속 ⨝ payments(status=completed) ⨝ 활동일수(readings+payments distinct date ≥2)
- SQL 스냅샷: 세션 scratchpad `cohort_metrics.sql`/`qclose.sql`/`biz.sql` (임시).

## 5. 한계

- v3 창 3일 — 전환 n=13로 아직 얇음(±신뢰구간 큼). 표본 더 쌓이면 재실행.
- traffic-mix 미통제(§2 교란).
- 오늘 배포(75340d2)부터 구조·가격·연애상담 신설이 섞이므로 **이 v3 판정은 "순수 persona 창"의 마지막 스냅샷** — 이후는 다변수.
