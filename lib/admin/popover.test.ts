import { test } from "node:test";
import assert from "node:assert/strict";
import { placePopover, POPOVER_MARGIN as M, POPOVER_GAP as GAP } from "./popover.ts";

// 실측 지오메트리 — 코디네이터가 볼 두 폭을 그대로 박는다.
//
// 1009px 데스크톱: 사이드바 lg:w-64(256) + main md:p-8(32×2) → 그리드 689px.
//   lg:grid-cols-6 · gap-2(8×5=40) → 칸 (689−40)/6 = 108.17px.
// 375px 모바일: 사이드바 없음 + main p-4(16×2) → 그리드 343px.
//   grid-cols-2 · gap-2(8) → 칸 (343−8)/2 = 167.5px.
const POP = { width: 280, height: 180 };
const BTN = 15; // `?` 원의 폭

/** n 번째 칸(0-based) 안에서 라벨 뒤에 붙은 `?` 버튼의 대략 위치. */
function cellButton(gridLeft: number, cell: number, gap: number, i: number, labelW: number) {
  const left = gridLeft + i * (cell + gap) + 12 /* px-3 */ + labelW + 4 /* gap-1 */;
  return { left, width: BTN, top: 300, bottom: 315 };
}

test("1009px · 6칸 — 마지막 칸이 오른쪽으로 안 넘친다", () => {
  const vp = { width: 1009, height: 800 };
  const btn = cellButton(288, 108.17, 8, 5, 60);
  const { left } = placePopover(btn, POP, vp);
  assert.ok(left + POP.width <= vp.width - M, `오른쪽 넘침: ${left + POP.width} > ${vp.width - M}`);
  assert.equal(left, vp.width - POP.width - M); // 오른쪽 여백에 딱 붙는다
});

test("1009px · 6칸 — 첫 칸은 왼쪽으로 안 넘친다", () => {
  const vp = { width: 1009, height: 800 };
  const { left } = placePopover(cellButton(288, 108.17, 8, 0, 60), POP, vp);
  assert.ok(left >= M, `왼쪽 넘침: ${left} < ${M}`);
});

test("1009px · 6칸 — 6칸 전부 뷰포트 안", () => {
  const vp = { width: 1009, height: 800 };
  for (let i = 0; i < 6; i++) {
    for (const labelW of [40, 60, 88]) {
      const { left } = placePopover(cellButton(288, 108.17, 8, i, labelW), POP, vp);
      assert.ok(left >= M && left + POP.width <= vp.width - M, `칸 ${i} labelW=${labelW}: left=${left}`);
    }
  }
});

test("375px · 2칸 — 양쪽 칸 모두 클램프돼 뷰포트 안", () => {
  const vp = { width: 375, height: 667 };
  const w = Math.min(280, vp.width - 24); // 호출부의 min(280px, 100vw-24px)
  const pop = { ...POP, width: w };
  const a = placePopover(cellButton(16, 167.5, 8, 0, 60), pop, vp);
  const b = placePopover(cellButton(16, 167.5, 8, 1, 60), pop, vp);
  assert.equal(a.left, M); // 왼쪽 칸은 왼쪽 여백에 붙는다
  assert.equal(b.left, vp.width - w - M); // 오른쪽 칸은 오른쪽 여백에
  for (const { left } of [a, b]) assert.ok(left >= M && left + w <= vp.width - M);
});

test("가운데 칸은 버튼 중앙 정렬(클램프 안 걸림)", () => {
  const vp = { width: 1440, height: 900 };
  const btn = { left: 700, width: BTN, top: 300, bottom: 315 };
  const { left } = placePopover(btn, POP, vp);
  assert.equal(left, 700 + BTN / 2 - POP.width / 2);
});

test("아래 공간이 모자라면 위로 뒤집는다", () => {
  const vp = { width: 1009, height: 800 };
  const btn = { left: 500, width: BTN, top: 740, bottom: 755 };
  const { top } = placePopover(btn, POP, vp);
  assert.equal(top, 740 - GAP - POP.height); // 버튼 위
  assert.ok(top >= M);
});

test("아래가 넉넉하면 안 뒤집는다", () => {
  const vp = { width: 1009, height: 800 };
  const btn = { left: 500, width: BTN, top: 300, bottom: 315 };
  assert.equal(placePopover(btn, POP, vp).top, 315 + GAP);
});

test("위아래 둘 다 모자라면 뷰포트 안으로 클램프", () => {
  const vp = { width: 1009, height: 300 }; // 가로 모드처럼 낮은 화면
  const btn = { left: 500, width: BTN, top: 150, bottom: 165 };
  const { top } = placePopover(btn, POP, vp);
  assert.ok(top >= M, `위로 넘침: ${top}`);
  assert.equal(top, Math.max(M, vp.height - POP.height - M));
});

test("뷰포트가 툴팁보다 좁아도 좌표가 뒤집히지 않는다", () => {
  // 폭 계산(min(280, vw-24))을 안 거친 값이 들어와도 음수가 나오면 안 된다.
  const { left } = placePopover({ left: 10, width: BTN, top: 100, bottom: 115 }, POP, { width: 200, height: 600 });
  assert.equal(left, M);
  assert.ok(left >= 0);
});
