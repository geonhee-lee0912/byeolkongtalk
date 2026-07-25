-- 페이지뷰 비콘 (2026-07-25)
-- 목적: 가입 이후 앱 내부 라우트 이탈 측정. Meta 픽셀은 광고 상단(노출→클릭→랜딩→가입)만 커버한다.
-- anon_id 는 middleware 가 첫 진입에 발급하는 byeolkong_anon_id (1년, httpOnly).
-- 로그인 후 요청엔 anon/user 쿠키가 함께 실리므로 이 테이블의 row 가 anon↔user 브리지가 된다.

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,

  anon_id TEXT,                                             -- error_logs.anonymous_id 와 같은 관행(TEXT)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,     -- 탈퇴 시 익명 통계로 강등

  path TEXT NOT NULL,                                       -- 정규화된 라우트 (:id 로 접힘)

  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  landing_variant TEXT,
  referrer TEXT,

  is_bot BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_anon ON page_views(anon_id, created_at) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id, created_at) WHERE user_id IS NOT NULL;

-- RLS: service_role 만 접근. 클라는 /api/pv 엔드포인트 경유 (error_logs 관행과 동일)
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
