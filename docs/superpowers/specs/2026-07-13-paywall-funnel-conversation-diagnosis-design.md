# 페이월 퍼널 · 대화 품질 통합 진단 — 분석 설계

**작성일**: 2026-07-13
**트리거**: 페이월(결제/충전 화면) **도달 52명** 달성 → 볼륨이 쌓여 전환 진단 가능.
**선행 분석**: [2026-07-12-gomintalk-dropout-persona-analysis.md](2026-07-12-gomintalk-dropout-persona-analysis.md) · [findings](2026-07-12-gomintalk-dropout-persona-findings.md) (대화 내 이탈·페르소나 진단). 어제는 **결제 전 퍼널을 명시적으로 범위 제외**했다 — 이번이 그 조각.

## 핵심 가설 (분석을 관통하는 하나의 인과 사슬)

> **대화 품질(페르소나·흐름)이 곧 전환·재구매를 좌우한다.** 어제 찾은 미시 패턴 — B(확답 회피), C(수렴 조기 종료), A(심문 피로) — 로 **불만족·미해결감을 안고 떠난 유저는 결제하지 않는다.** 따라서 정량 퍼널의 절벽과 정성 대화의 실패 패턴을 **분리된 두 분석이 아니라 하나의 사슬**로 엮는다.

정량이 "어디서 새는가"를 짚고, 정성이 "왜 새는가"를 설명하고, 산출물이 "무엇을 고치는가"로 닫는다.

## 조작적 정의 (admin/paywall 뷰와 정합)

`app/admin/paywall/page.tsx` 의 정의를 그대로 계승한다.

| 개념 | 정의 |
|---|---|
| 웰컴 별 | 신규 가입 시 **30별** 지급 (`lib/constants` `WELCOME_BONUS_STARS`) |
| 최저 상품가 | 타로 원카드 **10별** (사주 20별) → 잔액 <10 이면 무료로 더 못 봄 |
| **가입(signup)** | `users` row |
| **활성화(tried)** | `star_balances.total_spent > 0` (별을 한 번이라도 씀) |
| **페이월 도달(reached)** | `total_spent > 0` AND `balance < 10` (웰컴 다 쓰고 결제해야 하는 지점) |
| **결제 전환(converted)** | `payments.status='completed'` 1건 이상 |
| **재결제(repaid)** | `completed` 결제 2건 이상 |
| 운세 리포트 분리 | `readings.emotion_tag LIKE 'fortune:%'` = 단발 리포트, 대화형 아님 → 정성에서 제외, 정량에선 플래그 |
| 대화 상태 | `completed`(=`[END]`) / `abandon_0turn` / `abandon_mid` / `other` (어제 findings §이탈 정의 계승) |
| 페르소나 버전 | `readings.prompt_version` — `'pre-2026-07-12'`(백필) vs 튜닝 후 스탬프 |

## 데이터 접근 (방법론 A — 통합 단일 핸드오프)

- **소스**: prod Supabase. (`.env.local` 은 dev → 접근 불가)
- **경로**: 아래 SQL을 사용자가 Supabase 대시보드 SQL Editor에서 실행 → 결과를 분석자에게 전달 → 분석. 어긋나면 값싼 후속 쿼리 1회.
- **관리자/테스트 제외**: 필요 시 각 쿼리 최상단 CTE에 `WHERE id NOT IN ('<admin_uuid>', ...)` 추가 (admin 뷰의 `adminExclusionList` 대응). 기본은 포함.
- **프라이버시**: 고민톡은 민감 개인정보. 집계 위주, **커밋되는 findings에는 원문 저장 X · 예시 인용은 가림**, `has_sensitive=true` 대화는 정성 덤프(Q6)에서 제외.

## 분석 프레임 — 6개 렌즈

### 렌즈 1. 풀 퍼널 (유입 → 재결제)
가입→활성화→페이월 도달→결제→재결제의 단계별 통과·이탈 수와 %. 소재(`utm_content`)별로도 쪼개 CAC/ROAS까지. **어느 단계가 최대 절벽인지 확정.**
→ 쿼리 **Q1a**(top-line), **Q1b**(소재별).

### 렌즈 2. 활성화 · 무료 런웨이
30별로 유저가 리딩을 몇 번 하고 페이월에 닿는가. "1회만 하고 마는가 vs 여러 번 쓰는가"가 전환 예열 정도를 보여준다.
→ 쿼리 **Q2**.

### 렌즈 3. 대화 상태 × 전환 교차 (어제 프레임 확장)
어제의 상태 분포를, 이번엔 **유저 전환 여부로 교차**한다. "도중 이탈·미해결 종료가 미결제를 예측하는가"를 정량 검증. `prompt_version`으로 튜닝 전/후 표기(후행 데이터 소량은 감안), 결과열람율도 함께.
→ 쿼리 **Q3**.

### 렌즈 4. 리텐션 / 재방문 (런칭 <1주라도)
**재방문 = 가입 이후 다른 날 다시 활동(리딩/결제)** 으로 조작 정의. 순수 "결제 없는 페이지 재방문"은 DB에 없음(GA 영역) → 이 한계 명시하고 **행동 재방문**으로 근사. 재방문율, 활동일 수, 페이월 도달자 중 나중에 돌아온 사람 vs 영영 안 온 사람. 교차: **좋은 첫 마무리(completed·결과열람)가 재방문을 만드는가.**
→ 쿼리 **Q4**.

### 렌즈 5. 결제까지 안 이어지는 이유 (가설 기반)
관찰이 아니라 가설을 세우고 데이터로 검증:

| 가설 | 검증 |
|---|---|
| **H1 가치 미전달** — 리딩이 기대만큼 안 채움 | 미전환자 대화 정독(Q6) + 결과열람율(Q3) |
| **H2 갈증 미해결** — 확답 회피/조기종료로 "더 묻고 싶은데 잘림" | 마지막 유저 발화 성격 = 패턴 B/C (Q6) |
| **H3 가격/결제 마찰** — 충전 UX·최소 패키지 부담 | 페이월 도달 후 **결제 시도(pending) 흔적** 유무 (Q5) |
| **H4 다음 단계 부재** — 리딩 끝에 "결제하면 이걸 더" CTA 없음 | result/END 흐름 코드 검토(§코드 검토) |
| **H5 신뢰 부족** — 첫 리딩이 "맞다" 확신을 못 줌 | 대화 중 의심/부정 발화 빈도 (Q6) |

특히 **H3는 Q5로 결정적으로 갈린다**: 페이월 도달 미전환자가 (a) 결제 시도조차 안 함(never_attempted) → H1/H2/H4/H5 문제, (b) 시도했으나 미완료(attempted_not_completed) → H3 결제 UX 문제.

### 렌즈 6. 대화를 제대로 안 끝내고 나가는 페르소나 문제 (어제 A·D 심화)
정성 핵심 스레드. **유저 답변 길이의 턴별 궤적**(예: 15자→5자→2자→이탈)을 Q6 덤프에서 추적해, **답이 짧아지기 직전 별콩이가 뭘 했는지**(질문 강요? 3문단 독백? 공감 생략?)를 페르소나 규칙 번호에 매핑. "단답 2회 연속 = 지침 신호"인데 규칙 5(열린 질문 마무리)가 오히려 더 캐묻게 만드는 구조적 결함을 정량(abandon_mid율, Q3)+정성(사례, Q6)으로 이중 확인.

### 렌즈 7. 고민 분류(topic)별 전환 + 상품/매출 믹스 (어드민 보강)
어드민 애널리틱스(`app/admin/analytics`)가 이미 보여주는데 위 렌즈에 빠졌던 축을 편입:
- **고민 분류(`emotion_tag`)별 건수·유료·전환** — **연애 고민이 압도적**이라는 관찰을 정량 확인하고, 분류별 전환율 차이를 본다("연애가 물량은 많은데 전환은 낮은가" 등).
- **별 구매 상품별 매출 믹스 + 환불** — 어떤 패키지가 실제 매출을 만드는가, `refunded` 비율(불만족 신호).
- **코호트 LTV** — 리텐션%(렌즈 4)에 더해 가입 주차별 **누적 결제액/인**(어드민 CohortHeatmap 대응).
→ 쿼리 **Q7**(분류×전환), **Q8**(상품/매출/환불), **Q9**(코호트 LTV).

## 정성 방법 — 전환자 vs 미전환자 × 고민 종류

페이월 **도달 52명**의 대화를 **전환자 vs 미전환자로 태깅해 나란히 정독**(Q6), **그리고 고민 종류(`emotion_tag`)별로 다시 층화**한다.

**종류별 축이 왜 중요한가**: 고민 종류마다 유저의 **핵심 갈증이 다르고, 페르소나의 실패 방식도 다르다.** 연애가 압도적이니 특히 깊게:
- **연애·재회·짝사랑** (최다) → 갈증 = "될까 / 언제 / (그 사람이) 올까". 확답 회피(패턴 B)가 **여기서 가장 치명적** — 재회/썸은 "정해진 게 아니야"가 반복되면 "그럼 왜 봤지"로 직결. 종류별로 별콩이가 방향성 있는 답을 주는지 vs 회피 상용구를 도는지 집중 관찰.
- **취업·진로** → 갈증 = "언제 / 붙을까". 타이밍 질문 처리(커밋 이력상 timing-question-handling 있음)가 실제로 갈증을 푸는지.
- **금전·건강·인간관계 등 기타** → 표본 적으면 묶어서, 공통 실패만.

각 종류에 대해: (1) 대표 갈증 문장, (2) 별콩이의 응답이 그 갈증을 푸는가/도는가, (3) 종류별 이탈·전환 차이, (4) 종류별로 다른 페르소나 처방.

### 공통 정독 축 (전 종류 공통)

페이월 **도달 52명**의 대화를 **전환자 vs 미전환자로 태깅해 나란히 정독**(Q6). 축:
1. 마지막 리딩(벽에 닿기 직전 경험)에서 두 집단이 뭐가 달랐나.
2. 미전환자가 미해결 갈증(B/C)으로 떠났나 — 마지막 유저 발화가 "확답 요구"인가.
3. 답변 길이 궤적(렌즈 6) — 어디서 지쳤나.
4. 어제 패턴 A–E를 계속 규칙 번호에 매핑, 신규 패턴 추가.

## 산출물 — findings 문서 + 액션 (분석에서 끝내지 않음)

`docs/superpowers/specs/2026-07-13-paywall-funnel-conversation-findings.md`:

1. **퍼널 진단** — 단계별 수·% 표, 최대 절벽, 소재별 편차, **고민 분류별 물량↔전환 + 상품/매출 믹스·환불**.
2. **전환 이유 진단** — H1~H5 확인/기각 + 근거.
3. **대화 품질 진단** — 전환자/미전환자 대비, **고민 종류별(특히 연애) 갈증↔응답 진단**, 패턴 매핑, 답변길이 궤적, 가린 예시.
4. **리텐션 진단** — 재방문율·좋은 마무리↔재방문 상관, **코호트 LTV(누적 결제액/인)**.
5. **우선순위 액션** — 각 발견을 아래 4범주 액션으로, **[고치는 퍼널 단계 · 지렛대 크기 · 공수]** 태깅해 우선순위화:
   - **① 페르소나 편집** (`data/persona/byeolkong.md`) — 규칙 5/후속대화/규칙 1 예외·상한 (어제 findings §3 제안 계승·구체화)
   - **② 대화흐름/코드** — 수렴 종료 타이밍, `[END]` 유예(패턴 C), 후속 길이 상한
   - **③ 페이월/가격/UX** — 결제 순간의 가치 프레이밍, 다음-단계 CTA(H4), 충전 UX 마찰(H3)
   - **④ 유입/소재** — 소재별 ROAS 편차 기반 (데이터 충분할 때만)

실제 수정은 findings 확인 후 별도 후속 작업(writing-plans).

---

## 실행 SQL

> 순서대로 실행해 각 결과를 전달. Q6은 원문 포함이라 마지막에.

### Q1a — 퍼널 top-line

```sql
WITH u AS (
  SELECT id AS user_id FROM users
  -- 관리자/테스트 제외 시: WHERE id NOT IN ('<uuid>', ...)
),
bal AS (SELECT user_id, balance, total_spent FROM star_balances),
pay AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status='completed') AS paid_cnt,
    COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won
  FROM payments GROUP BY user_id
),
flags AS (
  SELECT u.user_id,
    COALESCE(b.total_spent,0) > 0 AS tried,
    (COALESCE(b.total_spent,0) > 0 AND COALESCE(b.balance,0) < 10) AS reached,
    COALESCE(p.paid_cnt,0) >= 1 AS converted,
    COALESCE(p.paid_cnt,0) >= 2 AS repaid,
    COALESCE(p.rev_won,0) AS rev_won
  FROM u
  LEFT JOIN bal b ON b.user_id = u.user_id
  LEFT JOIN pay p ON p.user_id = u.user_id
)
SELECT
  COUNT(*)                               AS signups,
  COUNT(*) FILTER (WHERE tried)          AS tried,
  COUNT(*) FILTER (WHERE reached)        AS reached,
  COUNT(*) FILTER (WHERE converted)      AS converted,
  COUNT(*) FILTER (WHERE repaid)         AS repaid,
  SUM(rev_won)                           AS revenue_won
FROM flags;
```

### Q1b — 소재(utm_content)별 퍼널 + CAC/ROAS

```sql
WITH bal AS (SELECT user_id, balance, total_spent FROM star_balances),
pay AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status='completed') AS paid_cnt,
    COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won
  FROM payments GROUP BY user_id
),
acq AS (
  SELECT u.id AS user_id, COALESCE(a.utm_content, '(organic/untracked)') AS creative
  FROM users u LEFT JOIN user_acquisition a ON a.user_id = u.id
),
flags AS (
  SELECT acq.creative, acq.user_id,
    COALESCE(b.total_spent,0) > 0 AS tried,
    (COALESCE(b.total_spent,0) > 0 AND COALESCE(b.balance,0) < 10) AS reached,
    COALESCE(p.paid_cnt,0) >= 1 AS converted,
    COALESCE(p.rev_won,0) AS rev_won
  FROM acq
  LEFT JOIN bal b ON b.user_id = acq.user_id
  LEFT JOIN pay p ON p.user_id = acq.user_id
),
spend AS (SELECT creative_key, SUM(spend_won) AS spend_won FROM ad_spend GROUP BY creative_key)
SELECT f.creative,
  COUNT(*)                          AS signups,
  COUNT(*) FILTER (WHERE tried)     AS tried,
  COUNT(*) FILTER (WHERE reached)   AS reached,
  COUNT(*) FILTER (WHERE converted) AS converted,
  SUM(f.rev_won)                    AS revenue_won,
  s.spend_won,
  CASE WHEN s.spend_won > 0 THEN ROUND(s.spend_won::numeric / NULLIF(COUNT(*),0)) END AS cac,
  CASE WHEN s.spend_won > 0 THEN ROUND(SUM(f.rev_won)::numeric / s.spend_won, 2) END AS roas
FROM flags f
LEFT JOIN spend s ON s.creative_key = f.creative
GROUP BY f.creative, s.spend_won
ORDER BY signups DESC;
```

### Q2 — 활성화 / 무료 런웨이 (별 쓴 유저의 리딩 횟수 분포)

```sql
WITH r AS (
  SELECT user_id,
    COUNT(*) AS readings_all,
    COUNT(*) FILTER (WHERE emotion_tag IS NULL OR emotion_tag NOT LIKE 'fortune:%') AS consult_readings,
    COUNT(*) FILTER (WHERE emotion_tag LIKE 'fortune:%') AS fortune_readings
  FROM readings GROUP BY user_id
),
b AS (SELECT user_id, total_spent FROM star_balances WHERE total_spent > 0)
SELECT
  COUNT(*)                                        AS tried_users,
  ROUND(AVG(r.readings_all), 2)                   AS avg_readings,
  ROUND(AVG(r.consult_readings), 2)               AS avg_consult,
  ROUND(AVG(b.total_spent), 1)                    AS avg_stars_spent,
  COUNT(*) FILTER (WHERE r.readings_all = 1)       AS only_1_reading,
  COUNT(*) FILTER (WHERE r.readings_all = 2)       AS exactly_2,
  COUNT(*) FILTER (WHERE r.readings_all >= 3)      AS three_plus
FROM b JOIN r ON r.user_id = b.user_id;
```

### Q3 — 대화 상태 × 전환 교차 (운세 리포트 제외)

```sql
WITH base AS (
  SELECT r.id, r.user_id, r.consultation_type, r.prompt_version,
    (r.result_viewed_at IS NOT NULL) AS result_viewed,
    COALESCE(SUM((m.role='user')::int),0)      AS user_turns,
    COALESCE(SUM((m.role='assistant')::int),0) AS assistant_turns,
    BOOL_OR(m.role='assistant' AND m.content LIKE '%[END]%') AS has_end,
    (SELECT m2.role FROM messages m2 WHERE m2.reading_id = r.id
       ORDER BY m2.created_at DESC LIMIT 1) AS last_role
  FROM readings r
  LEFT JOIN messages m ON m.reading_id = r.id
  WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
  GROUP BY r.id
),
cls AS (
  SELECT b.*,
    CASE
      WHEN has_end THEN 'completed'
      WHEN assistant_turns = 0 THEN 'no_reading'
      WHEN user_turns = 0 THEN 'abandon_0turn'
      WHEN last_role = 'assistant' THEN 'abandon_mid'
      ELSE 'other'
    END AS state
  FROM base b
),
conv AS (SELECT DISTINCT user_id FROM payments WHERE status='completed')
SELECT
  c.consultation_type,
  c.prompt_version,
  c.state,
  (c.user_id IN (SELECT user_id FROM conv)) AS user_converted,
  COUNT(*)                              AS n,
  COUNT(*) FILTER (WHERE result_viewed) AS result_viewed_n
FROM cls c
GROUP BY c.consultation_type, c.prompt_version, c.state, user_converted
ORDER BY c.consultation_type, c.prompt_version, n DESC;
```

### Q4 — 리텐션 / 재방문 (행동 재방문 근사) + 페이월 도달자 슬라이스

```sql
WITH act AS (
  SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS d FROM readings
  UNION
  SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM payments WHERE status='completed'
),
u AS (
  SELECT id AS user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS signup_d FROM users
),
bal AS (SELECT user_id, (total_spent>0 AND balance<10) AS reached FROM star_balances),
conv AS (SELECT DISTINCT user_id FROM payments WHERE status='completed'),
per AS (
  SELECT u.user_id, u.signup_d,
    COUNT(DISTINCT a.d)              AS active_days,
    BOOL_OR(a.d > u.signup_d)        AS revisited,
    COALESCE(b.reached,false)        AS reached,
    (u.user_id IN (SELECT user_id FROM conv)) AS converted
  FROM u
  LEFT JOIN act a ON a.user_id = u.user_id
  LEFT JOIN bal b ON b.user_id = u.user_id
  GROUP BY u.user_id, u.signup_d, b.reached
)
SELECT
  'ALL' AS segment,
  COUNT(*)                                                        AS users,
  COUNT(*) FILTER (WHERE active_days >= 1)                        AS active_users,
  COUNT(*) FILTER (WHERE revisited)                              AS revisited_users,
  ROUND(100.0*COUNT(*) FILTER (WHERE revisited)
        / NULLIF(COUNT(*) FILTER (WHERE active_days>=1),0), 1)   AS revisit_pct_of_active,
  ROUND(AVG(active_days), 2)                                      AS avg_active_days
FROM per
UNION ALL
SELECT
  'REACHED' AS segment,
  COUNT(*),
  COUNT(*) FILTER (WHERE active_days >= 1),
  COUNT(*) FILTER (WHERE revisited),
  ROUND(100.0*COUNT(*) FILTER (WHERE revisited)
        / NULLIF(COUNT(*) FILTER (WHERE active_days>=1),0), 1),
  ROUND(AVG(active_days), 2)
FROM per WHERE reached;
```

### Q5 — 결제 마찰 (H3 결정) : 페이월 도달자의 결제 시도 여부

```sql
WITH reached AS (
  SELECT user_id FROM star_balances WHERE total_spent > 0 AND balance < 10
),
p AS (
  SELECT user_id,
    BOOL_OR(status='completed') AS has_completed,
    COUNT(*)                    AS pay_rows
  FROM payments GROUP BY user_id
)
SELECT
  COUNT(*)                                                            AS reached,
  COUNT(*) FILTER (WHERE p.has_completed)                             AS converted,
  COUNT(*) FILTER (WHERE p.user_id IS NOT NULL
                    AND NOT COALESCE(p.has_completed,false))          AS attempted_not_completed,
  COUNT(*) FILTER (WHERE p.user_id IS NULL)                           AS never_attempted
FROM reached rc
LEFT JOIN p ON p.user_id = rc.user_id;
-- 참고: 전체 결제 상태 분포
-- SELECT status, COUNT(*) n, COUNT(DISTINCT user_id) users FROM payments GROUP BY status;
```

### Q6 — 정성 대화 덤프 : 페이월 도달자, 전환자 vs 미전환자 (민감 제외)

```sql
WITH reached AS (
  SELECT user_id FROM star_balances WHERE total_spent > 0 AND balance < 10
),
conv AS (SELECT DISTINCT user_id FROM payments WHERE status='completed')
SELECT
  (r.user_id IN (SELECT user_id FROM conv)) AS converted,
  r.user_id, r.id AS reading_id,
  r.consultation_type, r.saju_product, r.emotion_tag,
  r.continuation_mode, r.prompt_version, r.result_viewed_at, r.question,
  m.role, m.content, m.created_at
FROM readings r
JOIN reached rc ON rc.user_id = r.user_id
LEFT JOIN messages m ON m.reading_id = r.id
WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
  AND r.has_sensitive = false
ORDER BY converted, r.user_id, r.created_at, m.created_at;
```

### Q7 — 고민 분류(emotion_tag)별 물량 + 전환 (운세 제외)

```sql
WITH r AS (
  SELECT r.id, r.user_id, r.consultation_type,
    COALESCE(r.emotion_tag, '(없음)') AS topic
  FROM readings r
  WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
),
conv AS (SELECT DISTINCT user_id FROM payments WHERE status='completed')
SELECT
  r.consultation_type,
  r.topic,
  COUNT(*)                  AS readings,
  COUNT(DISTINCT r.user_id) AS users,
  COUNT(DISTINCT r.user_id) FILTER (WHERE r.user_id IN (SELECT user_id FROM conv)) AS converted_users
FROM r
GROUP BY r.consultation_type, r.topic
ORDER BY readings DESC;
```

### Q8 — 별 구매 상품별 매출 믹스 + 환불

```sql
SELECT
  package_type,
  status,
  COUNT(*)                    AS n,
  COALESCE(SUM(amount_won),0) AS amount_won,
  COUNT(DISTINCT user_id)     AS users
FROM payments
GROUP BY package_type, status
ORDER BY package_type, status;
```

### Q9 — 코호트 LTV (가입 주차별 누적 결제액/인, KST 월요일 기준)

```sql
WITH u AS (
  SELECT id AS user_id,
    date_trunc('week', (created_at AT TIME ZONE 'Asia/Seoul'))::date AS cohort_week
  FROM users
),
rev AS (
  SELECT user_id, SUM(amount_won) AS rev_won
  FROM payments WHERE status='completed' GROUP BY user_id
)
SELECT
  u.cohort_week,
  COUNT(*)                                                       AS cohort_size,
  COUNT(*) FILTER (WHERE COALESCE(r.rev_won,0) > 0)              AS payers,
  COALESCE(SUM(r.rev_won),0)                                     AS total_rev_won,
  ROUND(COALESCE(SUM(r.rev_won),0)::numeric / NULLIF(COUNT(*),0)) AS rev_per_user_won
FROM u LEFT JOIN rev r ON r.user_id = u.user_id
GROUP BY u.cohort_week
ORDER BY u.cohort_week DESC;
```

## 어드민 대비 커버리지

이 진단이 어드민 애널리틱스(`app/admin/analytics`, `app/admin/paywall`)의 지표를 다 흡수하는지 대조:

| 어드민 뷰 | 대응 쿼리 |
|---|---|
| 페이월 퍼널 (도달/전환) | Q1a, Q5 |
| 소재별 퍼널 · CAC · ROAS | Q1b |
| 고민톡 고민 분류별 (건수·유료) | Q7 |
| 별 구매 상품별 매출 | Q8 |
| 코호트 LTV / 리텐션 | Q4(리텐션) + Q9(LTV) |
| 상담 완료 퍼널 (시작→[END]→결과열람) | Q3 |
| 일별 추세(가입/리딩/매출) | 어드민에서 직접 확인(진단 핵심 아님, 쿼리 생략) |

## 코드 검토 (SQL 밖, H4 확인용)

- `app/saju/result` · 타로 result 페이지 · `[END]`/재충전 블록 흐름: 리딩 종료 후 "결제하면 무엇을 더 얻는지" CTA가 있는가, 있으면 얼마나 강한가.
- 수렴 종료 로직(패턴 C): 마지막 유저 발화가 새 질문이면 `[END]` 유예 — 어제 커밋(68934e5)로 일부 반영됨 → 실제 효과를 Q3/Q6에서 재확인.

## 한계

- **N=52** (페이월 도달) — 소재별·상태별로 쪼개면 셀당 표본이 한 자릿수. 정량은 방향성, 결론의 무게는 정성에 둔다.
- **prompt_version 튜닝 후 데이터 소량** (2026-07-12 배포, 하루) — 전/후 비교는 표기만, 판단 유보.
- **순수 재방문(무행동)** 은 DB에 없음 → GA 필요. 여기선 행동 재방문으로 근사.
- **강제종료(`forceEnd`) 미기록** — `completed` 내 자연수렴 vs 버튼종료는 정독 맥락으로 판단(어제와 동일 한계).
