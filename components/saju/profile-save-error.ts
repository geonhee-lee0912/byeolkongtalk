// 사주 프로필 저장(POST/PATCH /api/profiles) 실패 응답 → 팝업 오류 줄 문구.
// SelfSajuEditModal · NewPersonModal 공용 단일 원천 — 두 팝업의 문구가 따로 놀지 않게.
// 🔴 401·409 는 "잠시 후 다시"로 안 풀린다 — 다시 눌러도 같은 요청이 반복된다. 409 의 흔한 경로는
//    POST 는 커밋됐는데 응답이 모바일망에서 유실된 경우다(새로고침하면 열 때 내 사주를 다시 읽어 PATCH 로 열린다).
//    지인 저장(relationType ≠ self)에는 409 가 나지 않는다 — route.ts 의 409 는 self 생성 전용.
// 네트워크 예외(응답 없음)는 상태코드가 없어 여기 오지 않는다 — 각 팝업의 "연결이 잠시 흔들렸어" 문구.
export function profileSaveErrorMessage(status: number): string {
  if (status === 401) return "로그인이 풀렸어. 다시 로그인해줄래?";
  if (status === 409) return "이미 저장된 사주가 있어. 새로고침하고 다시 열어줄래?";
  return "저장을 못 했어. 잠시 후 다시 시도해줄래?";
}
