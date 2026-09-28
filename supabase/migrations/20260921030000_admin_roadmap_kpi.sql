-- admin_roadmap_kpi — 흑자 전환 로드맵 v2 §3 의 판정 지표. 주 1회 읽는 3층.
--
-- 원본 = scripts/roadmap-kpi-snapshot.sql (사람이 손으로 돌리던 것 · 같은 커밋에 동봉).
-- 창·공휴일·제외만 인자로 빼고 나머지 산식은 **한 글자도 바꾸지 않는다** — 판정 지표는 배포 전에
-- 고정했고, 화면으로 옮기면서 정의가 바뀌면 베이스라인과 비교가 불가능해진다.
--
-- ⚠️ 공휴일 가입 제외 · 고래 캡 ₩20,000 · D7 7일 성숙은 로드맵 §3 의 "읽는 법"이다.
--    캡과 성숙 기준은 **인자로 빼지 않는다** — 호출부가 바꿀 수 있으면 그 순간 판정 기준이 아니게 된다.
-- ⚠️ LEAST 는 NULL 을 무시하므로 비결제자를 **먼저 0 으로** 만들어야 한다
--    (안 하면 비결제자가 20000 으로 잡혀 고래 캡 지표가 통째로 뒤집힌다).
--    → `LEAST(COALESCE(rev, 0), 20000)` 의 COALESCE 가 LEAST **안쪽**에 있는지 확인할 것.
--
-- ── 원본 대비 바뀐 것 (전부 의도적 · 2026-09-27 이식 시점 기록) ────────────────────────────
-- 1) 창(params.s/e) → p_since/p_until · 공휴일(holidays) → p_holidays · 제외(excl) → p_exclude.
--    win_start_kst / win_end_kst_excl 두 컬럼은 인자가 됐으므로 반환에서 빠졌다(호출부가 이미 안다).
-- 2) 🔴 제외 방식: 원본은 `left(u.id::text,8) not in (…)` 로 **UUID 앞 8자 prefix** 매칭,
--    여기는 `usr.id <> ALL(p_exclude)` 로 **전체 UUID** 매칭이다. 두 방식이 같은 유저 집합을
--    고르는지는 prefix 가 유일한지에 달려 있다 — **2026-09-27 prod 실측: 제외 6개 prefix 가
--    각각 정확히 1명에만 매칭**(9ff43266·b9e5dd5a·7f83a4d7·a3bcc2c7·3d648ebe·d8fdcdd0 → n=1),
--    그래서 같은 6명을 넘기면 두 방식이 동치다. 같은 창으로 21개 컬럼 전부 일치를 확인했다.
--    ⚠️ 미래에 같은 8자 prefix 를 가진 유저가 새로 생기면 **원본 쪽이** 그 사람까지 추가로 빼므로
--    그때부터 둘은 갈린다. 그 경우 정본은 이 RPC(전체 UUID) 쪽이다 — prefix 매칭이 원래 약식이었다.
-- 3) CTE 이름 `p` → `pay`. 원본은 `params p` 와 payments 집계 `p` 가 공존했는데 params 가 인자로
--    빠지면서 이름이 비었다. **이름만 바뀌고 본문은 원본과 같다.**
-- 4) 원본의 맨몸 `/ count(*)` 를 `/ NULLIF(COUNT(*), 0)` 으로 감쌌다. 창에 가입자가 0명일 때
--    원본은 division_by_zero 로 죽고 여기는 NULL 을 돌려준다 — **0명이 아닌 한 값이 같다**
--    (에러 ↔ NULL 의 차이라 숫자를 바꾸지 못한다).
-- 5) organic_pct 는 **원본에 없던 신규 컬럼**이다(스펙 §7 정본: user_acquisition 행이 **없는** 가입).
--    그래서 이 컬럼만 원본과 대조 대상이 아니다.
--
-- ── 🔴 고치지 않고 남겨 둔 결함: fr CTE 에 타이브레이커가 없다 ───────────────────────────────
-- `ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.created_at)` 의 ORDER BY 에 타이브레이커가
-- 없다. 같은 유저의 리딩 둘이 **created_at 이 완전히 같으면** rn=1 이 실행마다 달라질 수 있고,
-- 그러면 first_reading 기반 컬럼들(premium/two_first_*·silent_exit·viewed·avg_user_turns)이 흔들린다.
-- 원본이 그렇게 생겼기 때문에 **의도적으로 그대로 옮겼다.** 여기서 `, r.id` 를 더하면 RPC 와 과거
-- 스냅샷이 서로 다른 값을 말하게 된다.
-- → 고치려면 **베이스라인(로드맵 §1 의 W5 수치)을 새로 잡는 것이 선행**이다. 산식만 바꾸면
--   "배포 전에 고정한 정의 그대로"라는 3층의 유일한 가치가 사라진다.
--
-- ⚠️ p_until 은 **필수다**(NULL 허용 안 함). 다른 2층 RPC 들은 `p_until IS NULL` 을 열린 창으로
--    받지만 여기는 원본이 `created_at < p.e` 를 무조건 쓰므로 그 분기를 두지 않았다.
--    → **호출부가 항상 닫힌 창을 넘겨야 한다.** NULL 을 넘기면 코호트가 통째로 빈다(에러가 아니라
--      조용히 0명) — 판정 화면에서 가장 위험한 실패 모드라 호출부에서 막을 것.
CREATE OR REPLACE FUNCTION admin_roadmap_kpi(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[],
  p_holidays DATE[]
)
RETURNS TABLE (
  users BIGINT,
  first_reading_pct NUMERIC,
  premium_first_share_pct NUMERIC,
  two_first_share_pct NUMERIC,
  two_first_payer_pct NUMERIC,
  two_first_rev_ps NUMERIC,
  payer_pct NUMERIC,
  arppu NUMERIC,
  rev_ps NUMERIC,
  rev_ps_whalecap20k NUMERIC,
  repeat_payers BIGINT,
  silent_exit_pct NUMERIC,
  viewed_pct NUMERIC,
  avg_user_turns NUMERIC,
  shop_visit_pct NUMERIC,
  shop_to_pay_pct NUMERIC,
  inchat_sheet_opens BIGINT,
  organic_pct NUMERIC,
  visit2_pct NUMERIC,
  d7_eligible BIGINT,
  d7_return_pct NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT usr.id, (usr.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours') AS ts
    FROM users usr
    WHERE usr.created_at >= p_since
      AND usr.created_at < p_until
      AND usr.id <> ALL(p_exclude)
      AND (usr.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date <> ALL(p_holidays)
  ), fr AS (
    -- 🔴 ORDER BY 에 타이브레이커 없음 = 원본 그대로. 파일 상단 주석 참조 — 고치려면 베이스라인부터.
    SELECT x.* FROM (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.created_at) AS rn
      FROM readings r
    ) x WHERE x.rn = 1
  ), m AS (
    SELECT msg.reading_id,
           COUNT(*) FILTER (WHERE msg.role = 'user') AS ut,
           bool_or(msg.role = 'assistant' AND msg.content LIKE '%[END]%') AS ended
    FROM messages msg GROUP BY 1
  ), pay AS (
    SELECT p.user_id, SUM(p.amount_won) AS rev, COUNT(*) AS n
    FROM payments p WHERE p.status = 'completed' GROUP BY 1
  ), sh AS (
    SELECT pv.user_id, MIN(pv.created_at) AS t
    FROM page_views pv
    WHERE pv.path LIKE '/shop%' AND pv.user_id IS NOT NULL
    GROUP BY 1
  ), ic AS (
    SELECT COUNT(*) AS n FROM ui_events e
    WHERE e.event = 'recharge_sheet_opened'
      AND e.meta->>'source' = 'inchat'
      AND e.created_at >= p_since AND e.created_at < p_until
  ), v AS (
    SELECT pv.user_id,
           COUNT(DISTINCT (pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date) AS days,
           MAX(pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours') AS last_ts
    FROM page_views pv
    WHERE pv.user_id IS NOT NULL AND NOT COALESCE(pv.is_bot, false)
    GROUP BY 1
  ), g AS (
    SELECT u.id, u.ts,
      CASE WHEN fr.spread_type IN ('relationship_5','deep_feelings_5','reunion_5','reunion_deep_7',
                                   'potential_7','new_love_5','readiness_6','healing_6','checkin_6') THEN 'premium'
           WHEN fr.spread_type = 'three_card' THEN 'three'
           WHEN fr.spread_type = 'two_card' THEN 'two'
           WHEN fr.spread_type = 'one_card' THEN 'one'
           WHEN fr.id IS NULL THEN 'none' ELSE 'other' END AS grp,
      fr.id AS rid, fr.stars_spent, fr.result_viewed_at, m.ut, m.ended,
      pay.rev, pay.n AS pn, sh.t AS sh_t, v.days, v.last_ts,
      (SELECT COUNT(*) FROM user_acquisition a WHERE a.user_id = u.id) AS acq_rows
    FROM u
    LEFT JOIN fr ON fr.user_id = u.id
    LEFT JOIN m ON m.reading_id = fr.id
    LEFT JOIN pay ON pay.user_id = u.id
    LEFT JOIN sh ON sh.user_id = u.id
    LEFT JOIN v ON v.user_id = u.id
  )
  SELECT
    COUNT(*)::BIGINT,
    ROUND(100.0 * COUNT(rid) / NULLIF(COUNT(*), 0), 1),
    -- P1: 첫 스프레드가 프리미엄(5장+)인 비중 (결제율은 정의상 100%)
    ROUND(100.0 * COUNT(*) FILTER (WHERE grp = 'premium') / NULLIF(COUNT(*), 0), 1),
    -- P2: two_card 첫선택 층 (웰컴 15 판정의 본체)
    ROUND(100.0 * COUNT(*) FILTER (WHERE grp = 'two') / NULLIF(COUNT(*), 0), 1),
    ROUND(100.0 * COUNT(rev) FILTER (WHERE grp = 'two') / NULLIF(COUNT(*) FILTER (WHERE grp = 'two'), 0), 1),
    ROUND(COALESCE(SUM(rev) FILTER (WHERE grp = 'two'), 0) / NULLIF(COUNT(*) FILTER (WHERE grp = 'two'), 0)),
    -- Primary
    ROUND(100.0 * COUNT(rev) / NULLIF(COUNT(*), 0), 1),
    ROUND(COALESCE(SUM(rev), 0) / NULLIF(COUNT(rev), 0)),
    ROUND(COALESCE(SUM(rev), 0) / NULLIF(COUNT(*), 0)),
    ROUND(SUM(LEAST(COALESCE(rev, 0), 20000)) / NULLIF(COUNT(*), 0)),
    COUNT(*) FILTER (WHERE pn > 1)::BIGINT,
    -- 대화 품질 (유료 첫 리딩)
    ROUND(100.0 * COUNT(*) FILTER (WHERE stars_spent > 0 AND NOT COALESCE(ended, false))
          / NULLIF(COUNT(*) FILTER (WHERE stars_spent > 0), 0), 1),
    ROUND(100.0 * COUNT(result_viewed_at) FILTER (WHERE stars_spent > 0)
          / NULLIF(COUNT(*) FILTER (WHERE stars_spent > 0), 0), 1),
    ROUND(AVG(ut) FILTER (WHERE stars_spent > 0), 2),
    -- 페이월 경로
    ROUND(100.0 * COUNT(sh_t) / NULLIF(COUNT(*), 0), 1),
    ROUND(100.0 * COUNT(rev) FILTER (WHERE sh_t IS NOT NULL) / NULLIF(COUNT(sh_t), 0), 1),
    (SELECT n FROM ic)::BIGINT,
    -- 오가닉 = user_acquisition 행이 **없는** 가입(스펙 §7 정본). 원본에 없던 신규 컬럼.
    ROUND(100.0 * COUNT(*) FILTER (WHERE acq_rows = 0) / NULLIF(COUNT(*), 0), 1),
    -- 리텐션 (D7 은 7일 성숙한 가입만 분모)
    ROUND(100.0 * COUNT(*) FILTER (WHERE days >= 2) / NULLIF(COUNT(*), 0), 1),
    COUNT(*) FILTER (WHERE ts < (now() AT TIME ZONE 'UTC' + INTERVAL '9 hours') - INTERVAL '7 days')::BIGINT,
    ROUND(100.0 * COUNT(*) FILTER (WHERE last_ts >= ts + INTERVAL '7 days')
          / NULLIF(COUNT(*) FILTER (WHERE ts < (now() AT TIME ZONE 'UTC' + INTERVAL '9 hours') - INTERVAL '7 days'), 0), 1)
  FROM g;
$$;

REVOKE ALL ON FUNCTION admin_roadmap_kpi(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], DATE[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_roadmap_kpi(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], DATE[]) TO service_role;
