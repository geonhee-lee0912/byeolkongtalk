-- UI 이벤트 비콘 (2026-07-31)
--
-- 왜: 출구 칩(`✨ 결과 카드 보기`)의 클릭이 7/25 이후 143 리딩에 **0건**인데, 노출이 순수
-- 클라이언트 상태(`setExitOffer(true)`)라 **서버에 흔적이 하나도 없다.** 그래서
--   ① 칩이 안 떴다(렌더 조건 실패)  vs  ② 떴는데 안 눌렀다(1턴엔 무관해서 무시)
-- 를 가를 방법이 없었다. 노출을 기록해야 다음 판정이 성립한다.
--
-- ⚠️ `/api/pv` 를 재사용하면 안 된다 — 그쪽은 `normalizePath` 로 라우트를 집계하므로
--    가짜 경로를 넣으면 `/admin/traffic` 의 라우트 표가 오염된다. 전용 소형 테이블이 맞고,
--    UI 계측은 앞으로도 계속 필요하니 이 테이블이 재사용된다.
--
-- 설계 메모
-- · `event` 는 자유 문자열(CHECK 없음) — 새 계측을 붙일 때 마이그레이션을 요구하지 않기 위해.
--   대신 앱에서 상수로 관리한다. 값이 늘면 어드민 집계는 반드시 SQL 집계로(cap 재발 금지).
-- · 턴 수·스프레드 같은 부가 정보는 `meta` JSONB 로. 컬럼을 늘리면 이벤트마다 스키마가 갈린다.
-- · 봇 필터 컬럼은 두지 않는다 — 이 이벤트들은 실제 UI 상호작용이라 봇이 만들 일이 없다.
--   (page_views 는 크롤러가 찍으므로 `is_bot` 이 필요했다)

CREATE TABLE IF NOT EXISTS ui_events (
  id BIGSERIAL PRIMARY KEY,

  -- anon_id 는 middleware 가 첫 진입에 발급하는 byeolkong_anon_id (page_views 와 같은 관행: TEXT)
  anon_id TEXT,
  -- 🔴 users(id) 참조 FK 는 CASCADE/SET NULL 을 반드시 명시한다(AGENTS.md).
  --    없으면 회원 탈퇴 users DELETE 가 23503 으로 막힌다. 여기선 익명 통계로 강등.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  event TEXT NOT NULL,                                      -- 'exit_chip_shown' | 'exit_chip_clicked' …
  reading_id UUID REFERENCES readings(id) ON DELETE SET NULL,
  meta JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 판독 축: "이 이벤트가 최근 N일에 몇 건" · "이 리딩에서 무엇이 일어났나"
CREATE INDEX IF NOT EXISTS idx_ui_events_event ON ui_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_events_reading ON ui_events(reading_id, created_at)
  WHERE reading_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ui_events_anon ON ui_events(anon_id, created_at)
  WHERE anon_id IS NOT NULL;

-- RLS: service_role 만. 클라는 /api/event 엔드포인트 경유 (page_views·error_logs 와 같은 관행).
-- 2026-07-29 기본권한 정리로 새 테이블은 RLS 를 깜빡해도 anon 이 못 만지지만,
-- 기본값은 플랫폼 쪽에서 되돌아갈 수 있으니 명시한다(이중 방어).
ALTER TABLE ui_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ui_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE ui_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ui_events_id_seq TO service_role;
