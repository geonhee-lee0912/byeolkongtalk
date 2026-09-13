import { test } from "node:test";
import assert from "node:assert/strict";
import { BAIT, BAIT_SLOTS, baitLead, type BaitSlot } from "./bait.ts";

test("BAIT — 자리 3종이 전부 있고 필드가 채워져 있다", () => {
  assert.equal(BAIT_SLOTS.length, 3);
  for (const slot of BAIT_SLOTS) {
    const b = BAIT[slot];
    assert.ok(b.title.length > 0, `${slot} title 없음`);
    assert.ok(b.chips.length >= 1, `${slot} chips 없음`);
    assert.ok(b.tail.length > 0, `${slot} tail 없음`);
  }
});

test("BAIT — 자물쇠·잠금 어휘를 쓰지 않는다(스펙 §9: 잠긴 게 아니라 아직 안 온 것)", () => {
  for (const slot of BAIT_SLOTS) {
    const all = [BAIT[slot].title, BAIT[slot].tail, ...BAIT[slot].chips].join(" ");
    assert.ok(!/🔒|잠금|잠긴|잠겨/.test(all), `${slot} 에 잠금 어휘가 있다: ${all}`);
  }
});

test("BAIT — 별콩이 화법: 존댓말·문어체 종결을 쓰지 않는다", () => {
  for (const slot of BAIT_SLOTS) {
    for (const line of [BAIT[slot].title, BAIT[slot].tail]) {
      assert.ok(!/[다요]\.?$/.test(line.trim()), `${slot} 이 반말 종결이 아니다: ${line}`);
    }
  }
});

test("baitLead — saju_report 는 화면에 뜬 등급 라벨을 이어받는다", () => {
  const lead = baitLead("saju_report", { gradeLabel: "잘 맞는 날" });
  assert.ok(lead.includes("잘 맞는 날"), `등급을 안 이어받았다: ${lead}`);
});

test("baitLead — 등급이 없으면 등급 없이도 말이 되는 문장을 준다", () => {
  const lead = baitLead("saju_report", {});
  assert.ok(lead.length > 0);
  assert.ok(!lead.includes("undefined"), `폴백에 undefined 가 샜다: ${lead}`);
});

test("baitLead — 세 자리 모두 문장을 준다", () => {
  for (const slot of BAIT_SLOTS) {
    const lead = baitLead(slot, { gradeLabel: "무난한 날", partnerName: "지민" });
    assert.ok(lead.length > 0, `${slot} lead 없음`);
    assert.ok(!lead.includes("undefined"), `${slot} 에 undefined: ${lead}`);
  }
});

test("baitLead — woori_30d 는 상대 이름을 쓰되 없으면 대명사로 흘린다", () => {
  assert.ok(baitLead("woori_30d", { partnerName: "지민" }).includes("지민"));
  const noName = baitLead("woori_30d", {});
  assert.ok(!noName.includes("undefined") && noName.length > 0);
});
