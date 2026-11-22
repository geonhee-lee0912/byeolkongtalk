// 운세 목록 첫 칸(MySajuRow)이 무엇을 보일지(순수 · 클라 세이프)
// 🔴 비로그인이 확실할 때만(=== false) 선물 칸 — 확인 실패면 로그인 유저에게 선물을 약속하지 않는다.
// 프로필을 못 불러온 것은 '생일 없음'이 아니다 — 생일이 있는 회원에게 '생일을 알려줘'가 떴다.
export function mySajuState<P extends { isPrimary: boolean; saju: unknown }>(
  authenticated: boolean | undefined,
  profiles: P[] | null,
): "anon" | "error" | P | null {
  if (authenticated === false) return "anon";
  if (!profiles) return "error";
  const primary = profiles.find((p) => p.isPrimary) ?? null;
  return primary?.saju ? primary : null;
}
