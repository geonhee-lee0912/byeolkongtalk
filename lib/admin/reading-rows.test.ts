import { test } from "node:test";
import assert from "node:assert/strict";
import { readingRowView } from "./reading-rows.ts";

// 🔴 여기 쓰인 consultation_type 은 **prod 에 실제로 존재하는 4종**이다(2026-09-27 전수:
//    tarot 2,385 · saju 325 · relationship 155 · relationship_sim 20). 새 종목이 생기면
//    이 테스트가 먼저 깨지는 게 아니라 **조용히 폴백**하므로, 폴백 동작 자체를 아래에서 잠근다.
test("readingRowView — 대화형 종목은 세 지표를 다 잰다", () => {
  assert.deepEqual(readingRowView("tarot", false), {
    label: "타로(대화)",
    ended: true,
    viewed: true,
    paid: true,
  });
  assert.deepEqual(readingRowView("saju", false), {
    label: "사주(대화)",
    ended: true,
    viewed: true,
    paid: true,
  });
});

// 페르소나가 [END] 를 금지하고 result 라우트도 없다 → 0% 가 아니라 "해당 없음" 이다.
// 🔴 paid 는 **연애 상담만** false 다 — 스레드 INSERT 가 stars_spent: 0 을 하드코딩하고 돈은
//    패스·스킬에 있다. 시뮬은 stars_spent: cost 를 쓰므로 0 이 **참값**이라 그대로 보여준다.
test("readingRowView — 연애 스레드는 종결·열람 개념이 없다", () => {
  assert.deepEqual(readingRowView("relationship", false), {
    label: "연애 상담(종결없음)",
    ended: false,
    viewed: false,
    paid: false,
  });
  assert.deepEqual(readingRowView("relationship_sim", false), {
    label: "연애 시뮬(종결없음)",
    ended: false,
    viewed: false,
    paid: true,
  });
});

// one-shot 리포트는 대화가 없다 — 어느 종목에 얹히든 완료·열람이 사라진다.
// 다만 **유료 여부는 남는다**(stars_spent: effectiveCost 로 값이 들어간다).
test("readingRowView — fortune 리포트는 완료·열람만 없고 유료는 잰다", () => {
  assert.deepEqual(readingRowView("tarot", true), {
    label: "타로(리포트)",
    ended: false,
    viewed: false,
    paid: true,
  });
  assert.deepEqual(readingRowView("saju", true), {
    label: "사주(리포트)",
    ended: false,
    viewed: false,
    paid: true,
  });
});

// 🔴 모르는 종목은 **숨기지 않고 보여준다** — 틀린 "—" 는 조용하지만 틀린 0% 는 누가 묻는다.
test("readingRowView — 모르는 종목은 숫자를 보여주는 쪽으로 폴백한다 (크래시하지 않는다)", () => {
  assert.deepEqual(readingRowView("brand_new_type", false), {
    label: "brand_new_type",
    ended: true,
    viewed: true,
    paid: true,
  });
  assert.deepEqual(readingRowView("", false), { label: "", ended: true, viewed: true, paid: true });
  // 모르는 종목에 리포트가 얹혀도 라벨만 붙고 크래시하지 않는다.
  assert.deepEqual(readingRowView("brand_new_type", true), {
    label: "brand_new_type(리포트)",
    ended: false,
    viewed: false,
    paid: true,
  });
});
