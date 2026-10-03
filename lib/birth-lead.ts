// Meta CAPI `Lead` = "내 사주에 생년월일이 처음 저장됨" (2026-10-03, 사주·별마루 광고 세트의 최적화 목표).
// 사주·별마루는 생일 없이는 아무것도 못 보므로, 생일 첫 입력이 가입보다 한 단계 깊은 관심 신호다.
// 🔴 내 사주(primary)를 쓰는 경로가 셋이다 — POST /api/profiles · PATCH /api/profiles/[id] ·
//    PATCH /api/relationship(target "me"). 새 경로를 만들면 여기도 같이 부를 것(안 부르면 리드가 조용히 샌다).
// 수정(이미 생일 있음)·지인 프로필·'생일 몰라요' 저장은 리드가 아니다.
export function isFirstBirthEntry(input: {
  isPrimary: boolean;
  prevBirth: string | null;
  nextBirth: string | null;
}): boolean {
  return input.isPrimary && !input.prevBirth && !!input.nextBirth;
}
