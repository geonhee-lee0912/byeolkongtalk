-- 별자리(byeoljari) — 무료 바이럴 관계망 지도. 게스트 비로그인 저장 + 로그인 claim.
-- 설계: docs/superpowers/specs/2026-08-15-p2-별자리-데이터-라우트-design.md
-- survey_responses 권한 패턴 복제. 게스트 생일은 저장하되 API 응답에서 미반환(계산 전용).

CREATE TABLE IF NOT EXISTS star_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id TEXT UNIQUE NOT NULL,
  -- 🔴 users(id) FK 는 CASCADE/SET NULL 명시(AGENTS.md). 지도는 호스트 소유물이라 탈퇴 시 삭제.
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- claim 전 NULL
  creator_anon_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- claim 조회(미소유 + anon 매칭)
CREATE INDEX IF NOT EXISTS idx_star_maps_creator_anon
  ON star_maps(creator_anon_id) WHERE owner_user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_star_maps_owner
  ON star_maps(owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS star_map_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES star_maps(id) ON DELETE CASCADE,
  display_name VARCHAR(50) NOT NULL,
  birth_date DATE NOT NULL,           -- 비공개(계산 전용), API 응답 미반환
  birth_time TIME,                    -- NULL = 시간 모름
  relation_type VARCHAR(20) NOT NULL
    CHECK (relation_type IN ('friend','lover','acquaintance','senior')),
  member_anon_id TEXT,                -- 넣은 브라우저(호스트 대리입력이면 호스트 anon)
  is_host BOOLEAN NOT NULL DEFAULT false,
  name_public BOOLEAN NOT NULL DEFAULT false,   -- 옵트인: 이름 공개(기본 별만)
  compat_visible BOOLEAN NOT NULL DEFAULT false,-- 옵트인: 다른 게스트에 궁합 공개(기본 호스트만)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_star_map_members_map ON star_map_members(map_id);

-- claim: 이 브라우저(anon)로 만든 미소유 지도를 로그인 유저에게 이전. 이전 개수 반환.
CREATE OR REPLACE FUNCTION claim_star_maps(p_anon_id TEXT, p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_anon_id IS NULL OR p_user_id IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE star_maps
    SET owner_user_id = p_user_id, updated_at = NOW()
    WHERE creator_anon_id = p_anon_id AND owner_user_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- RLS deny-all + service_role (survey_responses 관행). 신규 함수는 REVOKE 3종 명시(AGENTS.md).
ALTER TABLE star_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_map_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE star_maps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE star_map_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE star_maps TO service_role;
GRANT ALL ON TABLE star_map_members TO service_role;
REVOKE EXECUTE ON FUNCTION claim_star_maps(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_star_maps(TEXT, UUID) TO service_role;
