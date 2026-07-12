# 고민톡 대화 흐름 — 이탈 원인 · 페르소나 진단 분석 설계

**작성일**: 2026-07-12
**목적**: prod 실유저의 고민톡(사주·타로 상담) 대화 데이터를 분석해 (1) 대화 내 이탈이 발생하는 지점·원인과 (2) 페르소나(`data/persona/byeolkong.md`)에서 수정이 필요한 지점을 진단한다.
**범위 한정**: 별 22개 차감 후 시작된 대화(readings+messages) 안에서의 **대화 내 이탈**과 **페르소나 톤**. 결제 전 퍼널 이탈(랜딩→로그인→concern→결제)은 별개 테이블(user_acquisition 등)이라 이번 범위에서 제외.

## 접근 방식

- **데이터 소스**: prod Supabase. (`.env.local`은 dev를 가리키므로 접근 불가)
- **접근 경로**: 분석자가 SQL을 작성 → 사용자가 Supabase 대시보드 SQL Editor에서 실행 → 결과(CSV/텍스트)를 분석자에게 전달.
- **방법론(C안, 하이브리드 단일 패스)**: 집계 쿼리 1개 + 층화 대화록 표본 쿼리 1개를 한 핸드오프에 함께 실행. 정량으로 절벽을 찾고 정성으로 톤을 진단한 뒤, 어긋나면 값싼 후속 쿼리 1회.
- **개인정보 처리**: 고민톡은 민감 개인정보(일부 `has_sensitive` 위기 신호). 집계 패턴 위주로 다루고, 커밋되는 리포트에는 원문을 저장하지 않으며 예시 인용은 가린다.

## 이탈·완료 조작적 정의

대화 데이터(messages)만으로 판정 가능한 상태:

| 상태 | 판정 규칙 | 의미 |
|---|---|---|
| `completed` | 마지막 assistant 메시지에 `[END]` 포함 | 정상 수렴 종료 |
| `no_reading` | assistant 메시지 0개 | 첫 풀이조차 생성 안 됨(생성 실패/즉시 이탈) |
| `abandon_0turn` ★ | assistant≥1, user=0, `[END]` 없음 | 첫 풀이 받고 **한 번도 답 안 함** — 최우선 표적 |
| `abandon_mid` | user≥1, `[END]` 없음, 마지막이 assistant | 대화하다 말없이 이탈 |
| `other` | 위에 안 걸리는 경우(마지막이 user 등) | 잔여 |

- **결과열람**: `completed` 중 `result_viewed_at IS NOT NULL` 은 결과 화면까지 도달.
- **강제종료 한계**: `forceEnd`("대화 마무리" 버튼) 여부가 DB에 남지 않아 `completed` 내 자연수렴 vs 버튼종료는 SQL로 구분 불가 → 표본 정독 시 맥락으로 판단.
- **fortune 혼입**: `readings`에 운세 리포트(단발형)가 `emotion_tag LIKE 'fortune:%'`로 섞여 있음. 대화형 상담과 성격이 달라 Q1에서는 `is_fortune` 플래그로 분리 표기, Q2 표본에서는 제외.

교차 축: `consultation_type`(saju/tarot), `saju_product`(상품별 첫 풀이 길이 상이), `continuation_mode`(첫 상담/이어가기), `has_sensitive`, 첫 풀이 글자수, 이탈 직전 별콩이 턴 특성.

## 분석 프레임

1. **정량(Q1)**: 상태 분포로 최대 누수 지점 확정. 첫 풀이 글자수 ↔ 0턴 이탈 상관, 사주/타로 차이, 이어가기 여부 차이.
2. **정성(Q2)**: 40개 대화록 정독 → 이탈 직전 별콩이 턴의 공통 패턴(너무 긺 / 독백 / 열린 질문 없음 / 공감 생략 / 되묻기 실패 등)을 페르소나 109줄의 **규칙 번호에 매핑**. 각 진단에 가린 예시 첨부.
3. **교차 검증**: 정량 절벽과 정성 패턴 일치 확인. 어긋나면 후속 쿼리 1회.

## 산출물

`docs/superpowers/specs/2026-07-12-gomintalk-dropout-persona-findings.md`(별도 findings 문서):
1. **이탈 진단** — 상태 분포 표 + 최대 누수 지점 + 가린 예시
2. **페르소나 진단** — 규칙별 문제점(규칙 번호 매핑) + 근거 대화
3. **우선순위 수정 제안** — `byeolkong.md` 구체적 편집안(무엇을/왜/어떻게), 영향 큰 것부터

페르소나 실제 수정은 findings 확인 후 별도 후속 작업.

## 실행 SQL

### Q1 — 상태 분포 집계

```sql
WITH base AS (
  SELECT
    r.id, r.consultation_type, r.saju_product, r.continuation_mode,
    r.has_sensitive,
    (COALESCE(r.emotion_tag,'') LIKE 'fortune:%') AS is_fortune,
    (r.result_viewed_at IS NOT NULL) AS result_viewed,
    COALESCE(SUM((m.role='user')::int),0)      AS user_turns,
    COALESCE(SUM((m.role='assistant')::int),0) AS assistant_turns,
    BOOL_OR(m.role='assistant' AND m.content LIKE '%[END]%') AS has_end
  FROM readings r
  LEFT JOIN messages m ON m.reading_id = r.id
  GROUP BY r.id
),
enriched AS (
  SELECT b.*,
    (SELECT LENGTH(REPLACE(m.content,'[END]',''))
       FROM messages m
       WHERE m.reading_id=b.id AND m.role='assistant'
       ORDER BY m.created_at ASC LIMIT 1) AS first_reading_chars,
    (SELECT m.role FROM messages m
       WHERE m.reading_id=b.id
       ORDER BY m.created_at DESC LIMIT 1) AS last_role
  FROM base b
),
classified AS (
  SELECT *,
    CASE
      WHEN has_end THEN 'completed'
      WHEN assistant_turns=0 THEN 'no_reading'
      WHEN user_turns=0 THEN 'abandon_0turn'
      WHEN last_role='assistant' THEN 'abandon_mid'
      ELSE 'other'
    END AS state
  FROM enriched
)
SELECT
  consultation_type, is_fortune, state,
  COUNT(*) AS n,
  ROUND(AVG(first_reading_chars)) AS avg_first_chars,
  ROUND(AVG(user_turns),1)        AS avg_user_turns,
  COUNT(*) FILTER (WHERE result_viewed) AS result_viewed_n
FROM classified
GROUP BY consultation_type, is_fortune, state
ORDER BY consultation_type, is_fortune, n DESC;
```

### Q2 — 층화 대화록 표본 (fortune 제외, 상태별 무작위)

```sql
WITH base AS (
  SELECT r.id,
    COALESCE(SUM((m.role='user')::int),0)      AS user_turns,
    COALESCE(SUM((m.role='assistant')::int),0) AS assistant_turns,
    BOOL_OR(m.role='assistant' AND m.content LIKE '%[END]%') AS has_end
  FROM readings r
  LEFT JOIN messages m ON m.reading_id = r.id
  WHERE COALESCE(r.emotion_tag,'') NOT LIKE 'fortune:%'
  GROUP BY r.id
),
enriched AS (
  SELECT b.*,
    (SELECT m.role FROM messages m WHERE m.reading_id=b.id
       ORDER BY m.created_at DESC LIMIT 1) AS last_role
  FROM base b
),
classified AS (
  SELECT *,
    CASE
      WHEN has_end THEN 'completed'
      WHEN assistant_turns=0 THEN 'no_reading'
      WHEN user_turns=0 THEN 'abandon_0turn'
      WHEN last_role='assistant' THEN 'abandon_mid'
      ELSE 'other'
    END AS state
  FROM enriched
),
picks AS (
  (SELECT id, state FROM classified WHERE state='abandon_0turn' ORDER BY random() LIMIT 15)
  UNION ALL
  (SELECT id, state FROM classified WHERE state='abandon_mid'   ORDER BY random() LIMIT 15)
  UNION ALL
  (SELECT id, state FROM classified WHERE state='completed'     ORDER BY random() LIMIT 10)
)
SELECT p.state, r.consultation_type, r.saju_product, r.emotion_tag,
       r.question, m.role, m.content, m.created_at
FROM picks p
JOIN readings r ON r.id = p.id
LEFT JOIN messages m ON m.reading_id = p.id
ORDER BY p.state, r.id, m.created_at;
```
