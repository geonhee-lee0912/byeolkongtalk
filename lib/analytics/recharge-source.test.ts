import { test } from "node:test";
import assert from "node:assert/strict";
import { RECHARGE_SOURCE } from "./recharge-source.ts";

/**
 * 🔴 로드맵 KPI(scripts/roadmap-kpi-snapshot.sql · admin_roadmap_kpi RPC)가
 * meta->>'source' = 'inchat' 으로 명시 필터한다. 새 지면이 inchat 을 재사용하면
 * "인챗 충전" 지표에 구매 지점 충전이 섞여 조용히 오염된다.
 */
test("inchat 은 인챗 전용 — 다른 지면이 재사용하면 안 된다", () => {
  const others = Object.entries(RECHARGE_SOURCE).filter(([k]) => k !== "inchat");
  assert.ok(others.length > 0, "새 지면 source 가 하나도 없다");
  for (const [key, value] of others) {
    assert.notEqual(value, "inchat", `${key} 가 inchat 을 침범한다`);
  }
});

test("source 값은 서로 겹치지 않는다 — 겹치면 지면별로 갈라 볼 수 없다", () => {
  const values = Object.values(RECHARGE_SOURCE);
  assert.equal(new Set(values).size, values.length);
});

test("inchat 의 값은 'inchat' 그대로 — 바꾸면 기존 KPI 가 0 이 된다", () => {
  assert.equal(RECHARGE_SOURCE.inchat, "inchat");
});
