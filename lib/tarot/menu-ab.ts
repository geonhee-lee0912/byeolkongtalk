// 타로톡 메뉴판 반반 비교(A/B) — 그룹 계산의 단일 원천. 순수 함수(클라 안전).
// 그룹은 저장하지 않고 user_id 로 계산한다. 판정 SQL·감시 쿼리(scripts/menu-ab-daily-check.sql)와 같은 규칙:
//   position(right(id::text,1) in '02468ace') > 0  → 메뉴판
// 스펙: docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §9 · §9-1

export type MenuArm = "menu" | "legacy";
export type MenuAbMode = "split" | MenuArm;

/** 판정 스위치 — 'split' = 반반 · 'menu'·'legacy' = 전원 한쪽(판정 뒤·고장 시). 상수라 바꾸면 재배포(prod 는 사용자 go).
 *  menu-ab.test.ts 의 "배포 기본 스위치 = split" 테스트는 일부러 걸리게 해 뒀다 — 스위치를 돌리면 그 테스트도 같이 고칠 것(지우지 말 것). */
export const MENU_AB: MenuAbMode = "split";

/** 메뉴판 그룹의 user_id 끝 글자 — 판정 SQL·감시 쿼리와 같아야 한다(menu-ab.test.ts 가 SQL 파일과 대조) */
export const MENU_LAST_CHARS = "02468ace";

/** 이 유저의 그룹(앱용 — 스위치 MENU_AB 를 따른다). 비로그인(그룹을 모름)은 옛 그룹 — 지금 prod 그대로 보인다. */
export function menuArmOf(userId: string | null | undefined): MenuArm {
  return armForMode(userId, MENU_AB);
}

/** 규칙 본체 — 스위치를 인자로 받는다(테스트·QA 픽스처 전용).
 *  🔴 앱 코드는 menuArmOf 를 쓸 것 — 이걸 직접 부르면 MENU_AB 를 돌려도 그 지점만 반반으로 남아 서버 가격과 화면이 어긋난다. */
export function armForMode(userId: string | null | undefined, mode: MenuAbMode): MenuArm {
  if (mode !== "split") return mode;
  const last = (userId ?? "").trim().slice(-1).toLowerCase();
  return last !== "" && MENU_LAST_CHARS.includes(last) ? "menu" : "legacy";
}
