import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_NAME, DAY_LINE, dayMarks } from "./day-label.ts";
import type { DayFactors } from "./day-score.ts";
import type { TenGod } from "@/lib/saju/pairing";

const ALL: TenGod[] = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"];

test("DAY_NAME — 십신 10종 전부에 하루 이름이 있고 서로 다르다", () => {
  const names = ALL.map((t) => DAY_NAME[t]);
  assert.equal(names.length, 10);
  for (const n of names) assert.ok(n.length > 0, "빈 이름");
  assert.equal(new Set(names).size, 10, "이름이 중복됐다");
});

test("DAY_LINE — 십신 10종 전부에 한 줄이 있고 반말로 끝난다", () => {
  for (const t of ALL) {
    const line = DAY_LINE[t];
    assert.ok(line.length >= 20, `${t} 한 줄이 너무 짧다`);
    // 별콩이는 해체 반말만 쓴다. 허용 어미를 열거하면(옛 방식) 카피가 바뀔 때마다 정규식을
    // 손봐야 하므로, 금지 어미(존댓말 ~요 / 문어체 ~다)만 막는다.
    assert.ok(!/[다요]\.?$/.test(line.trim()), `${t} 한 줄이 반말 종결이 아니다: ${line}`);
  }
});

const base: DayFactors = {
  relation: "비화",
  heavenlyCombo: false,
  sixCombo: false,
  clash: false,
  scarcity: "balanced",
};

test("dayMarks — 아무 신호도 없으면 빈 배열", () => {
  assert.deepEqual(dayMarks(base), []);
});

test("dayMarks — 천간합·육합이 같이 있으면 둘 다, 순서는 천간합 먼저", () => {
  const m = dayMarks({ ...base, heavenlyCombo: true, sixCombo: true });
  assert.deepEqual(m.map((x) => x.glyph), ["✧", "◇"]);
  assert.deepEqual(m.map((x) => x.label), ["천간합", "육합"]);
});

test("dayMarks — 충은 △", () => {
  assert.deepEqual(dayMarks({ ...base, clash: true }), [{ glyph: "△", label: "충" }]);
});

test("dayMarks — 그 오행이 아예 없으면 ＋(빈 곳 채움), 부족/보통/과다는 마크 없음", () => {
  assert.deepEqual(dayMarks({ ...base, scarcity: "absent" }), [{ glyph: "＋", label: "빈 곳 채움" }]);
  for (const s of ["scarce", "balanced", "excess"] as const) {
    assert.deepEqual(dayMarks({ ...base, scarcity: s }), []);
  }
});

test("dayMarks — 네 신호가 다 있으면 고정 순서로 넷 다", () => {
  const m = dayMarks({ ...base, heavenlyCombo: true, sixCombo: true, clash: true, scarcity: "absent" });
  assert.deepEqual(m.map((x) => x.glyph), ["✧", "◇", "△", "＋"]);
});
