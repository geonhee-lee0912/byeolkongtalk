// lib/admin/popover.ts — 떠 있는 툴팁의 좌표 계산. 순수(DOM·React import 0).
//
// 🔴 왜 컴포넌트에서 떼어냈나 — 좌우 클램프와 뒤집기는 브라우저를 띄워야만 보이는 종류의 로직이고,
//    컴포넌트 안에 두면 "108px 칸의 마지막 칸이 안 넘친다"가 영원히 눈대중 판정으로 남는다.
//    좌표만 순수 함수로 떼면 실측 지오메트리(1009px 뷰포트 · 108px 칸 · 375px 2칸)를 유닛
//    테스트에 박을 수 있다. 계약은 lib/admin/popover.test.ts 가 지킨다.

/** 뷰포트 가장자리에서 띄워 둘 최소 여백. */
export const POPOVER_MARGIN = 12;
/** 기준 버튼과 툴팁 사이 간격. */
export const POPOVER_GAP = 8;

export interface PopoverPos {
  top: number;
  left: number;
}

/**
 * 기준 버튼 아래(또는 위)에 툴팁을 놓을 좌표를 낸다. 전부 뷰포트 기준(`position: fixed`).
 *
 * - **좌우**: 버튼 중앙에 맞춘 뒤 뷰포트 안으로 클램프. 툴팁 폭은 칸 폭과 무관하다 — 그게
 *   좁은 칸에서도 읽히는 이유고, 클램프가 그 대가를 치른다.
 * - **상하**: 아래 공간이 모자라고 위가 넉넉하면 뒤집는다. 둘 다 모자라면 뷰포트 안으로 클램프한다
 *   (호출부가 max-height 로 높이를 제한하므로 그때도 화면 밖으로 나가지 않는다).
 */
export function placePopover(
  anchor: { left: number; top: number; width: number; bottom: number },
  pop: { width: number; height: number },
  viewport: { width: number; height: number }
): PopoverPos {
  const centered = anchor.left + anchor.width / 2 - pop.width / 2;
  // 🔴 안쪽 Math.max 가 필요하다 — 뷰포트가 툴팁보다 좁으면(vw < w + 2*MARGIN) 상한이 하한보다
  //    작아져서 Math.min/Math.max 순서만으로는 좌표가 음수로 뒤집힌다.
  const left = Math.min(Math.max(centered, POPOVER_MARGIN), Math.max(POPOVER_MARGIN, viewport.width - pop.width - POPOVER_MARGIN));

  const below = anchor.bottom + POPOVER_GAP;
  const above = anchor.top - POPOVER_GAP - pop.height;
  const flip = below + pop.height > viewport.height - POPOVER_MARGIN && above >= POPOVER_MARGIN;
  const top = flip
    ? above
    : Math.max(POPOVER_MARGIN, Math.min(below, viewport.height - pop.height - POPOVER_MARGIN));

  return { top, left };
}
