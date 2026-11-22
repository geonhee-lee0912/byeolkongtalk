// 새 회원 닉네임 — 애플은 이름을 첫 로그인 때만 주고(숨길 수도 있다), 카카오는 프로필 닉네임이 없을 수 있다.
// 🔴 대체 이름에 로그인 수단 식별자(회원번호·sub)나 거기서 계산한 값을 넣지 않는다 — 화면·결제사·내 사주 이름으로 퍼진다.
// users.nickname 은 VARCHAR(50).
const MAX = 50;

export type AppleName = { givenName?: string | null; familyName?: string | null } | null | undefined;

export function appleNickname(name: AppleName, rand: () => number = Math.random): string {
  const full = `${name?.familyName ?? ""}${name?.givenName ?? ""}`.trim();
  if (full) return Array.from(full).slice(0, MAX).join("");
  return randomNickname(rand);
}

/** 이름을 못 받은 새 회원의 이름. 무작위라 가입 때 한 번만 만든다(다시 로그인해도 그대로 — sign-in.ts) */
export function randomNickname(rand: () => number = Math.random): string {
  const n = Math.floor(rand() * 10000).toString().padStart(4, "0");
  return `별콩이_${n}`;
}
