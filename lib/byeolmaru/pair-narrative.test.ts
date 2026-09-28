import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLatestPairRow } from "./pair-narrative.ts";

test("pickLatestPairRow — 빈 입력은 null", () => {
  assert.equal(pickLatestPairRow([]), null);
  assert.equal(pickLatestPairRow(null), null);
  assert.equal(pickLatestPairRow(undefined), null);
});

test("pickLatestPairRow — 한 건이면 그것", () => {
  const row = { partner_profile_id: "p1", report: { a: 1 }, created_at: "2026-09-05T01:00:00Z" };
  assert.equal(pickLatestPairRow([row]), row);
});

// 🔴 같은 날 두 상대의 행이 실제로 생길 수 있다 — 상대 교체가 무료이고 하루 상한은
//    "새 상대 1명"이라 교체 후 생성이 가능하다(PAIR_REPORT_DAILY_LIMIT 주석).
test("pickLatestPairRow — 같은 날 두 건이면 created_at 최근 것", () => {
  const older = { partner_profile_id: "A", report: {}, created_at: "2026-09-05T01:00:00Z" };
  const newer = { partner_profile_id: "B", report: {}, created_at: "2026-09-05T09:00:00Z" };
  assert.equal(pickLatestPairRow([older, newer]), newer);
  assert.equal(pickLatestPairRow([newer, older]), newer, "입력 순서에 안 흔들린다");
});

test("pickLatestPairRow — created_at 이 없거나 깨져도 크래시하지 않는다", () => {
  const a = { partner_profile_id: "A", report: {}, created_at: null };
  const b = { partner_profile_id: "B", report: {}, created_at: "2026-09-05T09:00:00Z" };
  assert.equal(pickLatestPairRow([a, b]), b, "파싱 가능한 쪽이 이긴다");
  assert.ok(pickLatestPairRow([a]) === a, "전부 깨져도 첫 행은 돌려준다");
});
