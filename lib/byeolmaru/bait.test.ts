import { test } from "node:test";
import assert from "node:assert/strict";
import { BAIT, BAIT_SLOTS } from "./bait.ts";
import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";

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

test("BAIT — saju_report 구성 칩이 실제 리포트 섹션과 어긋나지 않는다", () => {
  // 칩은 손으로 쓴 축약형이라 파생이 안 된다 → 섹션이 바뀌면 페이월이 조용히 거짓말을 한다.
  // 개수와 "각 토큰이 해당 섹션 제목의 머리글자인가"를 계약으로 박는다.
  const tokens = BAIT.saju_report.chips[1].split(" · ");
  assert.equal(tokens.length, DAILY_SECTIONS.length, "섹션 수와 칩 토큰 수가 다르다");
  tokens.forEach((t, i) => {
    assert.ok(DAILY_SECTIONS[i].title.startsWith(t), `${i}번째 토큰 '${t}' 가 섹션 '${DAILY_SECTIONS[i].title}' 와 안 맞는다`);
  });
});
