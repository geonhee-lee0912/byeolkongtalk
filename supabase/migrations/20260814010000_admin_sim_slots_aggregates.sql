-- 어드민 시뮬·슬롯 집계 RPC (2026-08-14) — 로드맵 ③ 어드민 구성 한판.
--
-- 왜: 시뮬 무료 런웨이(관계당 3판)·1:N 슬롯(첫 관계 무료)을 방금 배포했는데
-- '무료 축적→유료 전환'을 볼 창이 0이다. funding 태그(readings.saju_data->>'funding')가
-- 무료/유료 판정의 유일 소스(무료 판은 star_transaction 이 없다).
--
-- 원본 행을 앱으로 끌어오지 않는다 — /admin/relationship 은 이미 RPC 집계다(20260731030000).
-- 날짜 창이 없는 누적 카운트라 KST 날짜식은 불필요하다(창이 없으므로).
-- ⚠️ 본문 컬럼은 전부 별칭 수식 — RETURNS TABLE OUT 파라미터가 본문 스코프에 들어와
--    funding·phase·id 처럼 흔한 이름과 겹친다.
--
-- 컬럼 NULL 가능성(추정 아님):
--   readings:       user_id NOT NULL · relationship_id·saju_data NULLABLE · consultation_type NOT NULL
--   relationships:  user_id NOT NULL · partner_profile_id NULLABLE
--   user_profiles:  personality NULLABLE
--   star_transactions: user_id/type/source/amount NOT NULL · reading_id NULLABLE

-- ── 1. 시뮬 요약 (funding 분포·전환·완주·초상화 축적) ──
-- funding: 무료 판은 트랜잭션이 없어 태그가 유일 소스. NULL(레거시)=paid 취급(SimMeta 주석 정합).
-- 런웨이 소진 관계 = funding='runway' 판이 SIM_FREE_RUNWAY(3)개인 관계(무료벽 도달). >= 3 로 안전하게.
-- 초상화 모집단 = 시뮬 플레이한 관계 distinct → partner 프로필 personality 가 비어있지 않은 것.
--   (personality 는 시뮬 관찰 append 외에 등록 입력으로도 채워질 수 있어 근사 프록시다 — 스펙 명시.)
-- 답변추천 = source='relationship_sim_suggest' spend 건수(환불은 별도 source 라 자동 제외).
CREATE OR REPLACE FUNCTION admin_sim_summary(p_exclude UUID[])
RETURNS TABLE (
  total_plays BIGINT, runway_plays BIGINT, hook_plays BIGINT, paid_plays BIGINT,
  debriefed_plays BIGINT, play_users BIGINT, play_rels BIGINT,
  runway_exhausted_rels BIGINT, suggest_purchases BIGINT,
  portrait_rels BIGINT, portrait_avg_len BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sim AS (
    SELECT rd.id AS id, rd.user_id AS user_id, rd.relationship_id AS relationship_id,
           coalesce(rd.saju_data->>'funding', 'paid') AS funding,
           (rd.saju_data->>'phase') AS phase
    FROM readings rd
    WHERE rd.consultation_type = 'relationship_sim'
      AND rd.user_id <> ALL(p_exclude)
  ), runway_by_rel AS (
    SELECT s.relationship_id AS relationship_id, count(*) AS n
    FROM sim s
    WHERE s.funding = 'runway' AND s.relationship_id IS NOT NULL
    GROUP BY s.relationship_id
  ), sim_rel AS (
    SELECT DISTINCT s.relationship_id AS relationship_id
    FROM sim s WHERE s.relationship_id IS NOT NULL
  ), portrait AS (
    SELECT up.personality AS personality
    FROM sim_rel sr
    JOIN relationships r ON r.id = sr.relationship_id
    JOIN user_profiles up ON up.id = r.partner_profile_id
    WHERE up.personality IS NOT NULL AND btrim(up.personality) <> ''
  )
  SELECT
    (SELECT count(*) FROM sim)::BIGINT,
    (SELECT count(*) FROM sim s WHERE s.funding = 'runway')::BIGINT,
    (SELECT count(*) FROM sim s WHERE s.funding = 'hook')::BIGINT,
    (SELECT count(*) FROM sim s WHERE s.funding = 'paid')::BIGINT,
    (SELECT count(*) FROM sim s WHERE s.phase = 'debriefed')::BIGINT,
    (SELECT count(DISTINCT s.user_id) FROM sim s)::BIGINT,
    (SELECT count(DISTINCT s.relationship_id) FROM sim s WHERE s.relationship_id IS NOT NULL)::BIGINT,
    (SELECT count(*) FROM runway_by_rel rb WHERE rb.n >= 3)::BIGINT,
    (SELECT count(*) FROM star_transactions t
       WHERE t.source = 'relationship_sim_suggest' AND t.type = 'spend'
         AND t.user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM portrait)::BIGINT,
    (SELECT coalesce(round(avg(char_length(p.personality))), 0) FROM portrait p)::BIGINT;
$$;

-- ── 2. 슬롯 요약 (구매·다중관계·관계수 분포) ──
-- 슬롯 구매 = source='relationship_slot' spend 건수(각 SLOT_COST=50, 매출은 앱에서 ×50).
-- 관계수 분포 = 어드민 제외 유저를 관계 수로 버킷(1 / 2 / 3+). 다중관계 = 2+ (1:N 실현).
CREATE OR REPLACE FUNCTION admin_slots_summary(p_exclude UUID[])
RETURNS TABLE (
  slot_purchases BIGINT, multi_rel_users BIGINT,
  rels_1 BIGINT, rels_2 BIGINT, rels_3plus BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH by_user AS (
    SELECT r.user_id AS user_id, count(*) AS n
    FROM relationships r
    WHERE r.user_id <> ALL(p_exclude)
    GROUP BY r.user_id
  )
  SELECT
    (SELECT count(*) FROM star_transactions t
       WHERE t.source = 'relationship_slot' AND t.type = 'spend'
         AND t.user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM by_user b WHERE b.n >= 2)::BIGINT,
    (SELECT count(*) FROM by_user b WHERE b.n = 1)::BIGINT,
    (SELECT count(*) FROM by_user b WHERE b.n = 2)::BIGINT,
    (SELECT count(*) FROM by_user b WHERE b.n >= 3)::BIGINT;
$$;

-- ── 권한: service_role 전용 ──
-- 🔴 AGENTS.md 규칙 — 새 SECURITY DEFINER RPC 는 PUBLIC·anon·authenticated 셋 다 명시 회수 + 시그니처 명시.
REVOKE EXECUTE ON FUNCTION admin_sim_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_slots_summary(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_sim_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_slots_summary(UUID[]) TO service_role;
