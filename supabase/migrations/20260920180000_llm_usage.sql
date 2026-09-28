-- llm_usage — 모든 LLM 호출의 토큰·원가 원장.
--
-- 🔴 왜 필요한가 — 2026-09-20 확인: 토큰·모델·비용을 **어디에도 기록하지 않았다**(테이블·컬럼 0).
--    흑자 전환이 목표인데 어드민은 매출만 알고 원가는 몰랐고, 원가는 Anthropic 콘솔을 손으로
--    파싱해서 봤다(scripts/parse-console-cost.mjs). 이 테이블이 그 수동 단계를 없앤다.
--
-- 🔴 cost_won 을 **적재 시점에 확정**하는 이유 — 단가는 바뀐다(모델 교체·환율). 조회할 때
--    계산하면 과거 원가가 소급 변조되어 손익 추세가 거짓말을 한다. 토큰 수와 확정 원가를 같이
--    남기면 둘 다 보존된다(단가를 나중에 채운 모델은 cost_won 이 NULL 이고 토큰으로 소급 가능).
--
-- ⚠️ is_free_user 컬럼은 **의도적으로 없다.** 적재 시점에 박으면 나중에 결제한 사람의 과거 행이
--    갱신되지 않아 기준이 섞이고, fire-and-forget 인서트가 payments 조회를 한 번 더 해야 한다.
--    "그 호출 시점에 결제 이력이 있었나"는 조회할 때 계산한다:
--      NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = lu.user_id
--                  AND p.status='completed' AND p.created_at < lu.created_at)
CREATE TABLE IF NOT EXISTS llm_usage (
  id BIGSERIAL PRIMARY KEY,

  -- streamChat 이 이미 들고 있는 logCtx 에서 온다. 셋 다 없을 수 있다(배치·백그라운드 호출).
  route TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 탈퇴해도 원가는 남긴다(매출 익명보존과 같은 관행)
  -- reading_id — FK 를 **의도적으로 걸지 않는다.**
  --   ⓐ "삭제 보존"만으로는 근거가 부족하다(SET NULL 도 같은 목표를 달성한다).
  --      진짜 이유는 이 insert 가 fire-and-forget 이라는 것이다 — 어드민이 스트리밍 도중
  --      리딩을 지우면 FK 위반으로 **원가 행 자체가 유실**된다. 감사 원장은 참조 무결성보다
  --      기록 보존이 우선이다.
  --   ⓑ 참조 시점 안전성은 확인됐다(2026-09-20): chat 라우트들은 전부 이전 요청에서 이미
  --      커밋된 reading 을 SELECT 해서 쓴다. 즉 FK 를 걸어도 정상 경로에선 깨지지 않는다 —
  --      안 거는 건 경합 시 손실을 막으려는 선택이지 순서 문제 때문이 아니다.
  reading_id UUID,

  provider TEXT NOT NULL,                                -- anthropic | openai | gemini | unknown(registry 미등록 폴백)
  model TEXT NOT NULL,

  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  tokens_cache_read INT NOT NULL DEFAULT 0,
  tokens_cache_write INT NOT NULL DEFAULT 0,

  -- 🔴 NUMERIC(12,4) — INT 가 아니다. 정수 반올림이면 캐시 히트 상태의 짧은 대화 턴
  -- (₩0.4616) 이 통째로 0 이 되는데, 그게 이 서비스에서 **가장 빈도 높은 호출**이다
  -- (luna 캐시 히트 99.6%). 한 번 0 으로 적재되면 원본은 복구 불가다.
  cost_won NUMERIC(12,4),                                -- NULL = 단가 미확정 (0 과 구별된다)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- provider 는 코드가 통제하는 닫힌 집합이다(model-registry 의 Provider 유니온 + unknown 폴백).
-- 리포 관례(messages.role · byeolmaru_watch.status 등)와 같이 CHECK 로 못박는다 — 오탈자 하나가
-- 나중에 "provider 별 분해"를 조용히 쪼개는 걸 막는다.
-- ⚠️ model 에는 CHECK 를 걸지 않는다 — 모델은 빈번히 늘어나 ui_events.event 쪽 근거가 적용된다.
DO $$ BEGIN
  ALTER TABLE llm_usage
    ADD CONSTRAINT llm_usage_provider_check
    CHECK (provider IN ('anthropic','openai','gemini','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL;  -- 재실행 안전 (파일의 IF NOT EXISTS 들과 같은 결)
END $$;

-- 1층은 "최근 7일 합", 2층은 "상품(route)별 분해"를 읽는다.
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_route_created ON llm_usage(route, created_at DESC);

-- ── 권한 ──────────────────────────────────────────────────────────────────
-- AGENTS.md 규칙: 2026-07-29 이후 기본 권한이 닫혀 있지만 명시 REVOKE 를 이중 방어로 유지한다.
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE llm_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE llm_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE llm_usage_id_seq TO service_role;
