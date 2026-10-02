// 세션 식별자(byeolkong_user_id / anon id) 형식 검증 — next 의존 없는 순수 함수.
//
// 유저 세션은 서명이 없다(users.id UUID 원문을 쿠키에 담음 — 설계상 의도, admin 만 HMAC).
// 그래서 쿠키 값은 클라가 임의로 만들 수 있다. users.id·anon id 는 전부 UUID 이므로
// 형식 검증만으로 "UUID 가 아닌 값"(위조·주입)을 거른다. 특히 PostgREST 필터에
// 문자열 보간되는 userId(app/api/popups/route.ts)에서 `,`·`(`·`.` 같은 메타문자가
// 든 값이 필터 식을 바꾸는 주입을 원천 차단한다.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
