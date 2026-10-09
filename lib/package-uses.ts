// /shop 패키지 카드의 "쓸 곳" 한 줄 — 메뉴판 그룹 상점에만 보인다(옛 그룹 = 지금 prod 그대로). 스펙 §3-1 · §9-1
// 🔴 문구가 가격 관계를 말한다("깊게 한 판 + 맛보기") — 가격이 바뀌면 거짓말이 되므로 package-uses.test.ts 가 산수를 지킨다.
import { EXTEND_TURNS } from "./upsell.ts";

export const PACKAGE_USES: Record<string, string> = {
  star_10: `한 장 더 · 대화 ${EXTEND_TURNS}턴 더`,
  star_30: "세 장 한 판 · 맛보기 두 판",
  star_55: "깊게 한 판",
  star_70: "끝까지 한 판 · 깊게 한 판 + 맛보기",
  star_130: "깊게 두 판 + 맛보기 한 판",
};
