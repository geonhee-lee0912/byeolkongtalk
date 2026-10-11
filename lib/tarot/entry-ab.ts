// 타로 로그인 전 맛보기 — 입구 반반 비교(A/B)의 그룹 계산 단일 원천. 순수 함수(클라 안전).
// 그룹은 저장하지 않고 익명 쿠키(byeolkong_anon_id)로 계산한다. 판정 SQL·감시 쿼리와 같은 규칙:
//   position(lower(right(anon_id,1)) in '02468ace') > 0  → 새 흐름
// 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §5-1 · §7
import { MENU_AB, type MenuAbMode } from "./menu-ab.ts";

export type EntryArm = "new" | "old";
export type EntryAbMode = "split" | EntryArm;

/** 스위치 — 'old' = 전원 지금 prod(구현 중 기본값: 중간 커밋이 dev→main 에 섞여 나가도 무해) · 'split' = 반반 · 'new' = 전원 새 흐름.
 *  상수라 바꾸면 재배포(prod 는 사용자 go). entry-ab.test.ts 의 "기본 스위치 = old" 테스트는 일부러 걸리게 해 뒀다 — 켤 때 그 테스트도 같이 고칠 것. */
export const ENTRY_AB: EntryAbMode = "old";

/** 새 흐름 그룹의 익명 쿠키 끝 글자 — 판정 SQL·감시 쿼리와 같아야 한다(entry-ab.test.ts 가 SQL 파일과 대조) */
export const ENTRY_LAST_CHARS = "02468ace";

/** 홈이 새 흐름으로 보낸 방문자 표시(sessionStorage) — 고민 쓰기가 "풀이는 카카오로 3초…" 안내를 띄운다 */
export const ENTRY_FLOW_KEY = "byeolkong:entry_flow";

/** 이 방문자의 입구 그룹(앱용 — 스위치 ENTRY_AB 를 따른다).
 *  🔴 메뉴판이 아직 반반(MENU_AB='split')이면 항상 'old' — 로그인 전 가격(비로그인 = 옛 그룹)과 로그인 뒤 가격(회원 그룹)이 어긋나 409 가 난다(스펙 §5-1 가드). */
export function entryArmOf(anonId: string | null | undefined): EntryArm {
  return entryArmForMode(anonId, ENTRY_AB, MENU_AB);
}

/** 규칙 본체 — 스위치를 인자로 받는다(테스트 전용). 🔴 앱 코드는 entryArmOf 를 쓸 것 */
export function entryArmForMode(
  anonId: string | null | undefined,
  mode: EntryAbMode,
  menuMode: MenuAbMode
): EntryArm {
  if (menuMode === "split") return "old";
  if (mode !== "split") return mode;
  const last = (anonId ?? "").trim().slice(-1).toLowerCase();
  return last !== "" && ENTRY_LAST_CHARS.includes(last) ? "new" : "old";
}

/** 새 장치(진행 저장·회원 충전 왕복 복원)가 켜졌나 — 스위치가 'old' 가 아니고 메뉴판이 반반이 아닐 때만. 스펙 §5-2 · §8 */
export function entryFeaturesOn(): boolean {
  return entryFeaturesOnFor(ENTRY_AB, MENU_AB);
}

export function entryFeaturesOnFor(mode: EntryAbMode, menuMode: MenuAbMode): boolean {
  return mode !== "old" && menuMode !== "split";
}
