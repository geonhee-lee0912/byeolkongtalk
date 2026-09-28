-- 별마루 어드민 집계 v2 (2026-09-27) — 화면이 재던 설계가 없어져서 계측을 현재 제품에 맞춘다.
--
-- 왜: 2026-09-24 에 우리 오늘의 상대가 **한 명**이 되고 슬롯 과금이 사라졌고, 09-26 에 스트립·
-- 접이식 격자가 빠졌다. 그 결과 어드민이 쓰던 이벤트 4종(partner_selected · watch_limit ·
-- watch_purchase · slot_clicked)이 **발화처 0** 이 됐다(코드 전수 확인: trackUiEvent 호출문 기준).
-- 반대로 지금 가장 많이 찍히는 gate_shown(dev 241건) · day_tab_changed(68) · free_item_clicked(23)
-- 과 체험·구독 퍼널은 **어느 어드민 화면에도 없다**. 이 파일이 그 간극을 메운다.
--
-- 🔴 **죽은 RPC 는 안 지운다.** admin_byeolmaru_watch_summary / _watch_distribution 과
--    admin_byeolmaru_summary 의 slot_clicked 칸은 그대로 둔다 — 과거 데이터를 읽을 유일한 경로다
--    (ui-events.ts 가 상수를 남기는 것과 같은 관행). 화면에서만 걷는다.
--
-- 🔴 **prod 에서 본문을 미리 못 돌렸다.** AGENTS.md 규율은 "적용 전 prod 에서 전 함수 본문 실행"
--    인데 prod 엔 byeolmaru_* 테이블도 llm_usage 도 **아직 없다**(별마루 미배포 — 2026-09-27 확인:
--    information_schema 에 byeolmaru 로 시작하는 테이블 0개). 그래서 검증은 dev 에서 했다.
--    prod 안전성은 **순서**가 담보한다: 이 파일(20260927…)보다 앞선 20260904~20260924 가
--    byeolmaru_* 를, 20260920180000 이 llm_usage 를 만든다. main 머지 때 타임스탬프 순으로
--    적용되므로 이 파일이 참조하는 객체는 전부 먼저 존재한다.
--
-- 규약(전부 AGENTS.md):
--   · 어드민 제외는 nullable 컬럼에서 (col IS NULL OR col <> ALL(p_exclude)) — NULL 3값 논리.
--     byeolmaru_* 의 user_id 는 전부 NOT NULL 이라 거기선 <> ALL 단독이면 충분하다.
--   · 날짜식은 (created_at AT TIME ZONE 'UTC' + interval '9 hours')::date.
--   · RPC 는 **원시 분자/분모만** 돌려준다. 비율은 lib/admin 의 pct1 이 만든다.
--   · service_role 전용 — PUBLIC·anon·authenticated 셋 다 명시 회수.

-- ── 1. 일별 추세 — kind 교체 (시그니처 동일하므로 CREATE OR REPLACE 로 충분) ──
-- 뺀 것: slot_clicked(영구 0). 넣은 것: free_item · gate_shown · trial · subscribe.
-- 추세에 넣을 기준은 "지금도 찍히고, 날짜별로 움직임을 읽을 가치가 있는가" 다.
CREATE OR REPLACE FUNCTION admin_byeolmaru_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, kind TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'pv', count(*)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/byeolmaru' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'uv',
         count(DISTINCT coalesce(pv.user_id::text, pv.anon_id))
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/byeolmaru' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  -- ui_events 5종을 한 스캔으로 — 이벤트명을 kind 로 접는다.
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date,
         CASE e.event
           WHEN 'byeolmaru_day_selected' THEN 'day_selected'
           WHEN 'byeolmaru_free_item_clicked' THEN 'free_item'
           WHEN 'byeolmaru_gate_shown' THEN 'gate_shown'
           WHEN 'byeolmaru_trial_started' THEN 'trial'
           ELSE 'subscribe'  -- byeolmaru_subscribe_completed (ARRAY 가 닫아둔 집합의 나머지)
         END,
         count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since
      AND e.event = ANY(ARRAY['byeolmaru_day_selected','byeolmaru_free_item_clicked',
                              'byeolmaru_gate_shown','byeolmaru_trial_started',
                              'byeolmaru_subscribe_completed'])
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1, 2
  ORDER BY 1;
$$;

-- ── 2. 페이월 → 체험/구독 퍼널 ──
-- 🔴 slot='*' 행은 **앱에서 합친 값이 아니라 DB 가 다시 센 값**이다. 액터 수는 더할 수 없다
--    (한 사람이 여러 slot 의 절단선을 보면 중복된다) — GROUPING SETS 로 전체를 따로 센다.
--    이걸 앱에서 sum 하면 "노출 본 사람"이 실제보다 많아져 전환율이 과소로 찍힌다.
CREATE OR REPLACE FUNCTION admin_byeolmaru_funnel(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (stage TEXT, slot TEXT, events BIGINT, actors BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT
      -- 접두사를 떼 화면 라벨과 가깝게. replace 는 event 가 닫힌 집합이라 안전하다.
      replace(e.event, 'byeolmaru_', '') AS stage_name,
      -- gate_shown 만 slot 이 의미 있다. trial/subscribe 의 meta.slot 은 "어느 절단선에서
      -- 눌렀나"라 있으면 같이 읽고, 없으면 '(없음)' — 누락과 진짜 NULL 을 화면에서 가른다.
      coalesce(e.meta->>'slot', '(없음)') AS slot_name,
      coalesce(e.user_id::text, e.anon_id) AS actor
    FROM ui_events e
    WHERE e.created_at >= p_since
      AND e.event = ANY(ARRAY['byeolmaru_gate_shown','byeolmaru_trial_started',
                              'byeolmaru_subscribe_clicked','byeolmaru_subscribe_completed'])
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
  )
  SELECT
    stage_name::TEXT,
    -- grouping() 으로 rollup 행을 명시적으로 가른다. coalesce(slot_name,'*') 로 하면
    -- "진짜 NULL slot" 과 "전체 행" 이 같은 값이 돼 구분이 사라진다(위에서 이미 '(없음)' 으로
    -- 접었지만, 그 접기에 의존하는 암묵 계약을 만들지 않는다).
    (CASE WHEN grouping(slot_name) = 1 THEN '*' ELSE slot_name END)::TEXT,
    count(*)::BIGINT,
    count(DISTINCT actor)::BIGINT
  FROM ev
  GROUP BY GROUPING SETS ((stage_name, slot_name), (stage_name))
  ORDER BY 1, 2;
$$;

-- ── 3. 허브 열람 · 우리 오늘 인터랙션 ──
-- 살아 있는 이벤트를 meta 의 "그 이벤트를 쪼개는 축" 으로 분해한다. kind 하나에 축 하나.
CREATE OR REPLACE FUNCTION admin_byeolmaru_engagement(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (kind TEXT, key TEXT, events BIGINT, actors BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT
      CASE e.event
        WHEN 'byeolmaru_free_item_clicked'   THEN 'free_item'
        WHEN 'byeolmaru_day_tab_changed'     THEN 'day_tab'
        WHEN 'byeolmaru_share_clicked'       THEN 'share'
        WHEN 'byeolmaru_guest_peek_clicked'  THEN 'guest_peek'
        WHEN 'byeolmaru_watch_add'           THEN 'watch_set'
        WHEN 'byeolmaru_watch_status_set'    THEN 'watch_status'
        -- 🔴 woori_cta 는 **퍼널의 단계가 아니라 출처 태그**다. WooriTodayView 의 락 티저는
        --    이 이벤트를 찍고 **곧바로 공용 훅**(startTrial/openSubscribe)을 부르므로 같은
        --    클릭이 trial_started · subscribe_clicked 로도 남는다(둘 다 slot='woori_30d').
        --    퍼널 수에 더하면 이중계상이다 — 화면 note 가 이 사실을 말한다.
        ELSE 'woori_cta'  -- byeolmaru_subscribe_from_woori
      END AS kind_name,
      -- 이벤트마다 쪼개는 축이 다르다(ui-events.ts 의 meta 계약 그대로):
      --   free_item=item · day_tab=to(도착 탭) · share=kind · guest_peek=card
      --   watch_set=via(pick|register) · watch_status=status · woori_cta=action(trial|subscribe)
      coalesce(
        e.meta->>'item', e.meta->>'to', e.meta->>'kind', e.meta->>'card',
        e.meta->>'via', e.meta->>'status', e.meta->>'action',
        '(없음)'
      ) AS key_name,
      coalesce(e.user_id::text, e.anon_id) AS actor
    FROM ui_events e
    WHERE e.created_at >= p_since
      AND e.event = ANY(ARRAY['byeolmaru_free_item_clicked','byeolmaru_day_tab_changed',
                              'byeolmaru_share_clicked','byeolmaru_guest_peek_clicked',
                              'byeolmaru_watch_add','byeolmaru_watch_status_set',
                              'byeolmaru_subscribe_from_woori'])
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
  )
  SELECT
    kind_name::TEXT,
    (CASE WHEN grouping(key_name) = 1 THEN '*' ELSE key_name END)::TEXT,
    count(*)::BIGINT,
    count(DISTINCT actor)::BIGINT   -- '*' 행은 DB 가 다시 센다(위 funnel 과 같은 이유)
  FROM ev
  GROUP BY GROUPING SETS ((kind_name, key_name), (kind_name))
  ORDER BY 1, 2;
$$;

-- ── 4. 산출물 · LLM 원가 ──
-- 🔴 이 축이 없으면 "별마루가 흑자인가"를 못 읽는다. 구독 매출은 2층이 이미 보지만, 그 반대편인
--    **생성 건수 × 생성당 원가**는 어느 화면에도 없었다. 리포트는 (user, 날짜) 캐시라 생성 건수가
--    곧 캐시 미스 수 = 과금 호출 수다.
-- 🔴 cost_won 은 NUMERIC(12,4) — 정수로 접지 않는다. 캐시 히트 턴(₩0.46)이 통째로 0 이 된다.
CREATE OR REPLACE FUNCTION admin_byeolmaru_output(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (category TEXT, key TEXT, cnt BIGINT, users BIGINT, cost_won NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- 산출물: 창 안에 **새로 만들어진** 행. byeolmaru_* 의 user_id 는 전부 NOT NULL 이라
  -- <> ALL(p_exclude) 단독으로 안전하다(위 ui_events 쪽과 달리 IS NULL 분기가 필요 없다).
  SELECT '산출물', '오늘 사주 리포트', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_daily_report t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  SELECT '산출물', '오늘 타로 카드', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_daily_card t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  SELECT '산출물', '타로 카드 해설', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_card_narrative t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  SELECT '산출물', '우리 오늘 리포트', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_pair_narrative t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  SELECT '산출물', '출석', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_checkins t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  SELECT '산출물', '상대 등록', count(*)::BIGINT, count(DISTINCT t.user_id)::BIGINT, NULL::NUMERIC
    FROM byeolmaru_watch t WHERE t.created_at >= p_since AND t.user_id <> ALL(p_exclude)
  UNION ALL
  -- 원가: route × model. 모델 분해를 유지하는 이유 — 2026-09-24 에 우리 오늘이 nano→luna 로
  -- 바뀌어 생성당 원가가 ₩0.7→₩2.3 으로 뛰었다. 합으로만 보면 그 전환이 안 보인다.
  -- LIKE 패턴에 `_` 가 없으므로 와일드카드 사고(AGENTS.md)는 해당 없다.
  SELECT '원가', u.route || ' · ' || u.model, count(*)::BIGINT,
         count(DISTINCT u.user_id)::BIGINT, coalesce(sum(u.cost_won), 0)::NUMERIC
    FROM llm_usage u
    WHERE u.created_at >= p_since
      AND u.route LIKE '/api/byeolmaru/%'
      AND (u.user_id IS NULL OR u.user_id <> ALL(p_exclude))
    GROUP BY u.route, u.model
  ORDER BY 1, 2;
$$;

-- ── 권한 ──
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_funnel(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_engagement(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_output(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_byeolmaru_funnel(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_engagement(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_output(TIMESTAMPTZ, UUID[]) TO service_role;
