// 🔴 AI 에 보내는 이름 — 본인 프로필의 display_name 은 로그인 닉네임(애플이면 실명일 수 있다) 복사본이라 보내지 않는다.
// 개인정보처리방침 제6조의2 의 약속. 잠금은 compat-self-name.test.ts. 화면·저장용 이름에는 쓰지 말 것.

export const SELF_PROMPT_NAME = "나";

/** 본인은 자리(첫째·둘째)로 못 가린다. 옛 저장 경로(/api/readings)엔 relation_type='self' 인데 is_primary 가 아닌 행도 있다. */
export function promptNameFor(row: { display_name: string; is_primary: boolean; relation_type: string }): string {
  return row.is_primary || row.relation_type === "self" ? SELF_PROMPT_NAME : row.display_name;
}
