-- 어드민 광고·팝업 집계 RPC (2026-07-31) — 남은 `.limit(100000)` 3곳 정리
--
-- 왜: /admin/ads 2곳 + /admin/popups 1곳이 `.limit(100000)` 으로 원본 행을 앱으로 끌어온다.
-- Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 +
-- Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않는다
-- (2026-07-28 사고: /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
--
-- ⚠️ 세 곳 다 **지금은 작다** — 2026-07-31 실측 user_acquisition 90일 584행 · ad_spend 68행 ·
--    popup_acks 는 팝업 100개 이내. 즉 이건 값을 고치는 픽스가 아니라 **구조적 픽스**다.
--    "cap 아래라 안전" 은 지금 규모에 대한 말일 뿐이고, 반환 행수를 데이터량에서 떼어내야
--    영구히 안전해진다.
--
-- ⚠️ 날짜: 이 파일에는 **날짜 버킷이 없다** — 그룹핑 축이 아니라 경계 비교(created_at >= p_since)
--    뿐이라 `at time zone 'UTC' + 9h` 캐스트가 등장할 자리가 없다. 경계값은 앱의
--    daysAgoKstIso(89) 가 이미 KST 자정을 UTC ISO 로 만들어 넘긴다.
--    ad_spend.spend_date 는 이미 DATE 라 변환 대상이 아니고, 여기선 아예 쓰지도 않는다
--    (총 지출은 전체 누적 = 날짜 필터 없음, 현행과 동일).
--
-- ⚠️ 본문 컬럼은 전부 별칭 수식한다 — RETURNS TABLE 의 OUT 파라미터가 본문 스코프에 들어와
--    CTE·서브쿼리 컬럼과 이름이 겹친다.

-- ── 1. 소재 제안 (AdSpendForm 의 datalist) ──
-- 현행 app/admin/ads/page.tsx 재현:
--   최근 90일 user_acquisition 의 utm_content → canonicalCreative 로 별칭 병합 → Set 으로 중복 제거
--   → falsy(NULL·'') 제거. 별칭 병합 후 dedupe 이므로 '새 판매 광고 - 사본' 과 'tarot' 이 한 항목이 된다.
-- 🔴 3값 논리 — utm_content 는 **nullable** 이다(20260705000000 스키마에 NOT NULL 없음).
--    NULL 은 `IS NOT NULL` 로 명시적으로 걷어낸다. `c.creative <> ''` 만 쓰면 NULL 행의 술어가
--    false 가 아니라 **NULL** 이라 어차피 빠지긴 하지만, 의도를 술어로 적어 둔다.
-- ⚠️ 어드민 제외를 걸지 **않는다** — 현행도 걸지 않는다. 이건 지표가 아니라 입력 자동완성이라
--    어드민이 만든 유입이라도 소재 키로는 유효하다.
-- ⚠️ **정렬 규칙이 바뀐다(의도)**: 현행 JS 는 ORDER BY 없는 조회 결과를 Set 에 넣는 순서라
--    사실상 비결정적이었다. 재현 불가능한 순서를 유지할 수 없으므로 유입 많은 순으로 고정한다
--    — 상한에 걸려도 "많이 쓰인 상위 N" 이 되어 잘림이 순서를 뒤집지 않는다(admin_funnel 과 같은 규칙).
-- 🔴 p_limit — 반환 행수가 소재 카디널리티에 비례한다. RPC 결과도 PostgREST 를 지나므로
--    상한을 안 박으면 cap 이 그대로 물린다. 상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
CREATE OR REPLACE FUNCTION admin_ad_creative_suggestions(
  p_since TIMESTAMPTZ, p_aliases JSONB, p_limit INT DEFAULT 200
)
RETURNS TABLE (creative TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.creative
  FROM (
    -- 별칭 맵의 단일 원천은 앱(CREATIVE_ALIASES)이고 여기로 JSONB 로 들어온다 —
    -- 맵을 SQL 에 복사하면 드리프트한다.
    SELECT admin_canonical_creative(a.utm_content, p_aliases) AS creative,
           count(*) AS cnt
    FROM user_acquisition a
    WHERE a.created_at >= p_since
    GROUP BY 1
  ) c
  WHERE c.creative IS NOT NULL AND c.creative <> ''
  ORDER BY c.cnt DESC, c.creative
  LIMIT p_limit;
$$;

-- ── 2. 총 광고 지출 (전체 누적) ──
-- 현행은 ad_spend 의 spend_won 을 전부 끌어와 앱에서 reduce 한다. 합계는 반환이 항상 1행이라
-- cap 개념이 소멸한다. spend_won 은 INTEGER NOT NULL 이지만 빈 테이블에서 sum 이 NULL 이 되므로
-- coalesce 로 0 을 준다(앱 reduce 의 초기값 0 과 동치).
CREATE OR REPLACE FUNCTION admin_ad_spend_total()
RETURNS TABLE (total_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(s.spend_won), 0)::BIGINT FROM ad_spend s;
$$;

-- ── 3. 팝업별 확인 수 ──
-- 현행 app/admin/popups/page.tsx 는 popup_acks 의 popup_id 원본을 끌어와 앱에서 Map 으로 센다.
-- popup_acks 의 PK 가 (popup_id, user_id) 라 유저 중복이 원천적으로 없다 → count(*) 로 충분하다
-- (DISTINCT user_id 불필요).
-- ⚠️ 확인 0건인 팝업은 **행이 안 나온다** — 현행 Map 도 그 키가 없어 `?? 0` 으로 떨어졌다. 동일.
-- 반환 행수는 p_popup_ids 길이 이하 = 호출부의 표시용 상한(popups .limit(100))에 이미 유계라
-- 별도 p_limit 을 두지 않는다. 목록 상한을 올리면 이 반환도 같이 커진다는 점만 기억할 것.
CREATE OR REPLACE FUNCTION admin_popup_ack_counts(p_popup_ids UUID[])
RETURNS TABLE (popup_id UUID, ack_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pa.popup_id, count(*)::BIGINT
  FROM popup_acks pa
  WHERE pa.popup_id = ANY(p_popup_ids)
  GROUP BY pa.popup_id;
$$;

-- ── 권한: service_role 전용 (게이트는 middleware 의 /admin 가드가 담당) ──
-- 🔴 AGENTS.md 규칙 — 새 SECURITY DEFINER RPC 는 PUBLIC·anon·authenticated 셋 다 명시 회수한다.
--    2026-07-29 부터 기본 권한이 닫혀 있어 새 함수는 닫힌 채 태어나지만, 기본값은 언제든
--    플랫폼 쪽에서 되돌아갈 수 있고 이중 방어가 싸다.
--    시그니처를 전부 명시한다 — 이름만 쓰면 오버로드가 생겼을 때 조용히 대상이 어긋난다.
REVOKE EXECUTE ON FUNCTION admin_ad_creative_suggestions(TIMESTAMPTZ, JSONB, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_ad_spend_total() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_popup_ack_counts(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_ad_creative_suggestions(TIMESTAMPTZ, JSONB, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_ad_spend_total() TO service_role;
GRANT EXECUTE ON FUNCTION admin_popup_ack_counts(UUID[]) TO service_role;
