// 사주 상품 구매 칸(FortuneSajuPicker)이 무엇을 보일지 정하는 순수 함수.
// 🔴 needsSelf 식은 예전 벽 조건 `(lockPrimary && !self) || profiles.length === 0` 과 같아야 한다 —
//    그래야 생일 있는 유저의 화면("list")이 이 변경 전후로 그대로다.
// 🔴 GET /api/profiles 는 비로그인에게도 200 {profiles:[]} 를 준다 — 목록만으로는 로그인 여부를
//    못 가르므로 authenticated 를 따로 받는다.
// 🔴 내 사주는 있는데 생일이 없으면 "list" 다(벽 아님) — 그 유저도 지인 사주는 계속 살 수 있어야 한다.
//    그 유저의 생일 입력 버튼은 목록 안(FortuneSajuPicker 의 선택된 내 사주 자리)에 있다. 스펙 §4-2.
export type PickerGate = "login" | "birth" | "list";

export function pickerGate(input: {
  profiles: readonly { isPrimary: boolean }[];
  lockPrimary: boolean;
  authenticated: boolean;
}): PickerGate {
  const hasSelf = input.profiles.some((p) => p.isPrimary);
  const needsSelf = (input.lockPrimary && !hasSelf) || input.profiles.length === 0;
  if (!needsSelf) return "list";
  return input.authenticated ? "birth" : "login";
}
