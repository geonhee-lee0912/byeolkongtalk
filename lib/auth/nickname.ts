// 새 애플 회원 닉네임 — 애플은 이름을 첫 로그인 때만 준다(사용자가 숨길 수도 있다).
// 카카오 닉네임 규칙(프로필 닉네임, 없으면 별콩이_{회원번호})은 lib/auth/kakao-verify.ts 에 있다.
// users.nickname 은 VARCHAR(50).
const MAX = 50;

export type AppleName = { givenName?: string | null; familyName?: string | null } | null | undefined;

export function appleNickname(name: AppleName, rand: () => number = Math.random): string {
  const full = `${name?.familyName ?? ""}${name?.givenName ?? ""}`.trim();
  if (full) return Array.from(full).slice(0, MAX).join("");
  const n = Math.floor(rand() * 10000).toString().padStart(4, "0");
  return `별콩이_${n}`;
}
