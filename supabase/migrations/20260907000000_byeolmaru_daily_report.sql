-- 20260907000000_byeolmaru_daily_report.sql — 별마루 유료 오늘 사주 리포트 캐시(하루 1행).
-- /fortune/daily 리포트(파서/렌더러/프롬프트 그대로 재사용)를 (유저,날짜)별로 캐싱한다.
CREATE TABLE IF NOT EXISTS byeolmaru_daily_report (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  report JSONB NOT NULL, -- lib/fortune/daily-report.ts 의 DailyReport(v:1) 객체
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_daily_report_user ON byeolmaru_daily_report(user_id, report_date DESC);
ALTER TABLE byeolmaru_daily_report ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_daily_report FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_daily_report TO service_role;
