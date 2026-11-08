// 입구 반반(로그인 전 맛보기, 2026-10-25~11-07)이 새 흐름 기기에 남긴 진행 저장을 지우는 일만 남았다.
// 새 흐름(카드 공개·로그인 창·로그인 뒤 복원)은 판정에서 옛 흐름이 이겨 걷어냈다. 저장을 읽어 7일 만료를 해 주던 코드도 같이 없어져,
// 지우지 않으면 그 기기에 고민 원문이 무기한 남는다 — 홈 방문·로그아웃·탈퇴 때 지운다(스펙 2026-10-11-타로-로그인전-맛보기 §10).
// 🗓️ 남은 저장이 다 지워졌다고 볼 만큼 지나면(판정 + 몇 달) 이 파일과 호출부(app/page.tsx · app/mypage/page.tsx)를 지워도 된다.

export const PENDING_DRAW_KEY = "byeolkong:pending_draw";

/** 남은 진행 저장을 지운다. 저장소가 막힌 브라우저(removeItem 이 던짐)에서도 던지지 않는다 */
export function clearPendingDraw(store: Pick<Storage, "removeItem">): void {
  try {
    store.removeItem(PENDING_DRAW_KEY);
  } catch {
    // noop
  }
}
