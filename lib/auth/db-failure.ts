// 로그인 수단 식별자·해시·닉네임이 실린 행을 쓰다 난 DB 오류는 원문 대신 이걸 logError 에 넘긴다.
// 원문의 message·details("Failing row contains …")엔 그 값이 그대로 실리고, error_logs 의 message 는 탈퇴 뒤에도 남는다.
export function dbFailure(what: string, error: { code?: string }): Error {
  return new Error(`${what} failed (${error.code || "no code"})`);
}
