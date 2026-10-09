// 타로톡 메뉴판 반반 비교(A/B) — 그룹 계산의 단일 원천. 순수 함수(클라 안전).
// 그룹은 저장하지 않고 user_id 로 계산한다. 판정 SQL·감시 쿼리(scripts/menu-ab-daily-check.sql)와 같은 규칙:
//   position(right(id::text,1) in '02468ace') > 0  → 메뉴판
// 스펙: docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §9 · §9-1

export type MenuArm = "menu" | "legacy";
export type MenuAbMode = "split" | MenuArm;

/** 판정 스위치 — 'split' = 반반 · 'menu'·'legacy' = 전원 한쪽(판정 뒤·고장 시). 상수라 바꾸면 재배포(prod 는 사용자 go). */
export const MENU_AB: MenuAbMode = "split";

/** 메뉴판 그룹의 user_id 끝 글자 */
const MENU_LAST_CHARS = "02468ace";

/** 이 유저의 그룹. 비로그인(그룹을 모름)은 옛 그룹 — 지금 prod 그대로 보인다. mode 는 테스트용(앱은 MENU_AB). */
export function menuArmOf(userId: string | null | undefined, mode: MenuAbMode = MENU_AB): MenuArm {
  if (mode !== "split") return mode;
  const last = (userId ?? "").trim().slice(-1).toLowerCase();
  return last !== "" && MENU_LAST_CHARS.includes(last) ? "menu" : "legacy";
}
