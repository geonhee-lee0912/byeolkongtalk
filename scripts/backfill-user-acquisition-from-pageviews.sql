-- 백필: 가입 시 user_acquisition 이 누락된 유저를 page_views(같은 anon_id, 비로그인)로 복구.
-- 마이그레이션 아님 — Supabase SQL 에디터(prod)에서 수동 실행.
-- 절차: (A) 실행 → total 확인 → (B) 의 expected 를 그 숫자로 교체 → (B) 실행. (B) 예외 = 아무것도 안 들어감.

-- ===== (A) DRY RUN (읽기 전용) =====
WITH single_anon AS (
  -- 정확히 한 user_id 에만 쓰인 anon_id (공유 기기·다계정 제외)
  SELECT anon_id, min(user_id::text)::uuid AS user_id
  FROM page_views
  WHERE user_id IS NOT NULL AND anon_id IS NOT NULL
  GROUP BY anon_id
  HAVING count(DISTINCT user_id) = 1
),
chosen AS (
  SELECT DISTINCT ON (u.id)
    u.id AS user_id, u.created_at AS signup_at,
    pv.utm_source, pv.utm_medium, pv.utm_campaign, pv.utm_content, pv.utm_term,
    pv.landing_variant, pv.referrer, pv.created_at AS pv_at
  FROM users u
  JOIN single_anon sa ON sa.user_id = u.id
  JOIN page_views pv ON pv.anon_id = sa.anon_id AND pv.user_id IS NULL
  WHERE NOT EXISTS (SELECT 1 FROM user_acquisition ua WHERE ua.user_id = u.id)
    AND (pv.utm_source IS NOT NULL OR pv.utm_content IS NOT NULL)
    AND pv.created_at <= u.created_at
    AND pv.created_at >= u.created_at - interval '30 days'
  ORDER BY u.id, pv.created_at ASC
)
SELECT coalesce(utm_content, '(utm_content 없음)') AS utm_content, count(*) AS users,
       sum(count(*)) OVER () AS total
FROM chosen
GROUP BY 1
ORDER BY 2 DESC;

-- ===== (B) INSERT — 단일 DO 블록 (Supabase SQL 에디터는 선택 영역을 한 번에 실행하므로 BEGIN/COMMIT 대신 사용) =====
-- 절차: ① (A) 를 실행해 total 확인 → ② 아래 expected 의 -1 을 그 숫자로 교체 → ③ (B) 블록만 선택해 실행.
-- INSERT 건수가 expected 와 다르면 RAISE EXCEPTION 으로 블록 전체가 롤백된다 = 아무것도 안 들어간다.
-- created_at = 가입 시각 → 어드민 집계 창이 오늘이 아닌 가입일로 귀속시킨다.
DO $$
DECLARE
  expected CONSTANT int := -1;  -- ← (A) 의 total 로 교체. -1 이면 실행 거부
  inserted int;
BEGIN
  IF expected < 0 THEN
    RAISE EXCEPTION 'expected 를 (A) 의 total 로 채우세요 (현재 %)', expected;
  END IF;

  INSERT INTO user_acquisition
    (user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
     landing_variant, referrer, first_seen_at, capture_source, created_at)
  SELECT user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         landing_variant, referrer, pv_at, 'backfill', signup_at
  FROM (
    WITH single_anon AS (
      -- 정확히 한 user_id 에만 쓰인 anon_id (공유 기기·다계정 제외)
      SELECT anon_id, min(user_id::text)::uuid AS user_id
      FROM page_views
      WHERE user_id IS NOT NULL AND anon_id IS NOT NULL
      GROUP BY anon_id
      HAVING count(DISTINCT user_id) = 1
    ),
    chosen AS (
      SELECT DISTINCT ON (u.id)
        u.id AS user_id, u.created_at AS signup_at,
        pv.utm_source, pv.utm_medium, pv.utm_campaign, pv.utm_content, pv.utm_term,
        pv.landing_variant, pv.referrer, pv.created_at AS pv_at
      FROM users u
      JOIN single_anon sa ON sa.user_id = u.id
      JOIN page_views pv ON pv.anon_id = sa.anon_id AND pv.user_id IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM user_acquisition ua WHERE ua.user_id = u.id)
        AND (pv.utm_source IS NOT NULL OR pv.utm_content IS NOT NULL)
        AND pv.created_at <= u.created_at
        AND pv.created_at >= u.created_at - interval '30 days'
      ORDER BY u.id, pv.created_at ASC
    )
    SELECT * FROM chosen
  ) c
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> expected THEN
    RAISE EXCEPTION 'INSERT % 건 != expected % — 롤백됨(아무것도 안 들어감)', inserted, expected;
  END IF;
  RAISE NOTICE 'OK: % 건 삽입', inserted;
END $$;
