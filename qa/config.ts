// qa/config.ts — QA 하네스 환경설정. 모든 env 접근을 여기로 모은다.

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[qa] missing env: ${name} (.env.local 확인)`);
  return v;
}

export const config = {
  // 대상 dev 서버 (로컬). 끝에 슬래시 없이.
  BASE_URL: process.env.QA_BASE_URL ?? "http://localhost:3000",

  // 고정 테스트 유저. .env.local에 QA_TEST_USER_ID 추가 권장(없으면 이 기본 UUID).
  TEST_USER_ID:
    process.env.QA_TEST_USER_ID ?? "11111111-1111-4111-8111-111111111111",
  // users.kakao_id NOT NULL — 실제 카카오 id(양수)와 충돌 안 나게 음수 센티넬.
  TEST_KAKAO_ID: -999001,
  TEST_NICKNAME: "QA봇",

  // 시드 충전량 (전체 매트릭스 다 돌아도 안 모자라게)
  SEED_BALANCE: 1_000_000,

  // 모델 티어
  SIMULATOR_MODEL: "claude-haiku-4-5-20251001",
  JUDGE_MODEL: "claude-sonnet-4-6",

  // chat 콜 간 대기 (레이트리밋 20/분 아래 유지)
  PACING_MS: 3500,

  // 안전 상한 — 한 대화의 최대 chat 콜 수 (시뮬레이터 폭주 방지).
  // 타로 relationship_5 의 absTurnCap(13)까지 자연 [END] 도달 여유를 두고 16.
  MAX_CHAT_CALLS_PER_CASE: 16,

  // idle_resume 케이스에서 실제로 대기할 시간 (테스트 속도 위해 짧게; 0이면 sleep 생략하고 재로딩만)
  IDLE_SLEEP_MS: 0,

  claudeApiKey: () => reqEnv("CLAUDE_API_KEY"),
} as const;
