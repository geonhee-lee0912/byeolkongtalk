-- admin_layer2_readings — 종목별 리딩 · 완료율 · 결과 열람 · 평균 유저 턴.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 12
--
-- 🔴 파일 번호가 플랜(20260921023000)과 다르다 — 그 번호는 Task 10 후속
--    (admin_subscriber_net_fresh_only)이 먼저 가져갔다. 023000 과 Task 13 예정분(024000)
--    사이인 023500 을 써서 적용 순서를 유지한다.
--    (이미 적용된 마이그레이션 파일은 편집하지 않는다 — 재실행이 안 되므로 dev 에는 영영 안
--     들어가고 prod 에만 들어가 스키마가 갈린다. 고칠 게 있으면 새 파일 + CREATE OR REPLACE.)
--
-- ⚠️ "완료"는 별콩이 발화에 [END] 마커가 있는 것이다(messages.content). turn_close 컬럼이
--    아니다 — 그건 발화가 어떤 상태에서 생성됐는지를 남기는 **추가** 계측이고, 종료 판정의
--    정본은 여전히 [END] 다(3층 roadmap KPI 와 같은 정의).
-- ⚠️ LIKE '%[END]%' 의 대괄호는 Postgres LIKE 에서 특별한 뜻이 없다(SIMILAR TO·정규식과 다르다).
--    `_` 와 `%` 만 와일드카드이고 여기엔 없다.
--
-- 🔴 avg_user_turns 는 COALESCE(m.user_turns, 0) 이다 — **메시지가 한 건도 없는 리딩도 0턴으로
--    분모에 넣는다.** 플랜 원안 `ROUND(AVG(m.user_turns), 2)` 는 LEFT JOIN 이 만든 NULL 을
--    AVG 가 **행째로 무시**해서, "한 마디도 못 하고 죽은 리딩"이 평균에서 빠져 평균이 과대해진다.
--    2026-09-27 prod 전 기간 실측 — relationship 3.05(원안) → 2.21(현행), 155건 중 **43건**이
--    메시지 0건이었다(원안이 +38% 과대). tarot 은 2,385건 중 1건뿐이라 4.13 → 4.13 로 무변.
--    즉 이 칸의 정의는 "발화한 사람의 평균"이 아니라 **리딩당 평균**이다.
--
-- 🔴 불변식: 같은 (p_since, p_until, p_exclude) 에서 SUM(cnt) == admin_layer1_flow.readings.
--    두 함수의 readings 필터가 글자 단위로 같아서 성립한다 — 어긋나면 1층과 2층이 서로 다른
--    모수를 말하는 것이고, 이 화면의 존재 이유가 무너진다.
--    2026-09-27 prod 인라인 대조: 7일 창 246 == 246 · 30일 창(상위 3명 제외) 956 == 956.
--
-- 성능(2026-09-27 prod EXPLAIN ANALYZE): 7일 창 **10.9ms**(messages 를 idx_messages_reading
--    으로 인덱스 스캔) · 전 기간 **95ms**(messages seq scan 21,338행, 2,016 buffer 전부 shared
--    hit). `LIKE '%[END]%'` 는 선행 와일드카드라 인덱스를 못 타지만, 이미 reading_id 로 좁혀
--    가져온 행에만 걸리는 **필터**라 스캔 비용이 아니다. 라우트의 창 상한이 365일이고 데이터가
--    2026-07 시작이라 전 기간이 곧 최악의 경우다.
CREATE OR REPLACE FUNCTION admin_layer2_readings(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  consultation_type TEXT,
  cnt BIGINT,
  paid_cnt BIGINT,
  ended_cnt BIGINT,
  viewed_cnt BIGINT,
  avg_user_turns NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win AS (
    SELECT r.id, r.consultation_type, r.stars_spent, r.result_viewed_at
    FROM readings r
    WHERE r.created_at >= p_since
      AND (p_until IS NULL OR r.created_at < p_until)
      AND r.user_id <> ALL(p_exclude)   -- readings.user_id 는 NOT NULL 이라 3값 논리 함정이 없다
  ), msg AS (
    SELECT m.reading_id,
           COUNT(*) FILTER (WHERE m.role = 'user') AS user_turns,
           bool_or(m.role = 'assistant' AND m.content LIKE '%[END]%') AS ended
    FROM messages m
    JOIN win ON win.id = m.reading_id
    GROUP BY 1
  )
  -- COALESCE 는 오늘 기준 **도달 불가**다(readings.consultation_type 은 NOT NULL). '(없음)' 행을
  -- 찾아 헤매지 말 것 — 컬럼이 nullable 로 바뀌는 날을 대비한 방어로만 남긴다.
  SELECT COALESCE(w.consultation_type, '(없음)')::TEXT,
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE w.stars_spent > 0)::BIGINT,
         COUNT(*) FILTER (WHERE COALESCE(m.ended, false))::BIGINT,
         COUNT(w.result_viewed_at)::BIGINT,
         ROUND(AVG(COALESCE(m.user_turns, 0)), 2)
  FROM win w
  LEFT JOIN msg m ON m.reading_id = w.id
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_readings(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_readings(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
