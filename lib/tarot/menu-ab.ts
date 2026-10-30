// 메뉴판 그룹 코드는 정리 배포로 걷어냈다. 입구 반반이 끝날 때까지만 남긴다.
// lib/tarot/entry-ab.ts 가 가드로 MENU_AB 를 읽고 entry-ab.test.ts 도 import 한다.
export type MenuAbMode = "split" | "menu" | "legacy";
// 2026-10-25 판정: 메뉴판 패(가입당 48h 매출 ₩54 vs ₩157 · 결제율 2.3% vs 7.6%) → 전원 옛 타로톡(사용자 결정)
export const MENU_AB: MenuAbMode = "legacy";
