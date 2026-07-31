import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTrendAxis } from "./aggregate.ts";

// ⚠️ 2026-07-31: 집계를 하던 순수 함수 7개(buildProductBreakdown·buildTrends·buildFunnel·
//    buildCohorts·buildStarSpendBreakdown·attributeFreeSpend·buildRelationshipFlow)와 그
//    테스트를 삭제했다. 집계가 전부 Postgres RPC(admin_analytics_*·admin_cohorts·
//    admin_star_spend_*·admin_relationship_*)로 넘어가 **프로덕션 호출처가 0** 이었는데 테스트만
//    남아 "전부 통과"가 거짓 안심을 주고 있었다 — 요청 경로에 없는 코드를 검증하고 있었던 것이다.
//    (같은 날 traffic.test.ts 도 같은 이유로 정리했다.)
//    지금 남은 테스트는 실제 요청 경로를 지난다. 집계 규칙(코호트 주차 인덱스·퍼널 모집단 두 갈래·
//    별 소모 분류 사다리·free-first 귀속)의 회귀 감지는 마이그레이션의 RPC 정의와
//    scripts/admin-expected-values.sql 정답지 대조가 담당한다.

// ── RPC 행 → 화면용 날짜 축 채우기 ────────────────────────────────────────────
// admin_analytics_trend 는 데이터가 있는 날만 반환한다. 축을 앱에서 채우지 않으면 수집이 끊긴
// 날이 행째로 사라져 그래프가 "그날은 0" 과 "그날은 없음" 을 구분 못 하게 된다.

test("fillTrendAxis — 데이터 없는 날도 0 으로 축에 남는다", () => {
  const out = fillTrendAxis([{ date: "2026-07-31", newUsers: 4, readings: 5, revenueWon: 5900 }], 3, "2026-07-31");
  assert.deepEqual(out.map((p) => p.date), ["2026-07-29", "2026-07-30", "2026-07-31"]);
  assert.deepEqual(out.map((p) => p.newUsers), [0, 0, 4]);
  assert.deepEqual(out.map((p) => p.revenueWon), [0, 0, 5900]);
});

test("fillTrendAxis — 축 밖(조회 경계 걸침) 날짜는 버린다", () => {
  const out = fillTrendAxis(
    [
      { date: "2026-07-01", newUsers: 9, readings: 9, revenueWon: 9 }, // 축 밖
      { date: "2026-07-31", newUsers: 4, readings: 5, revenueWon: 5900 },
    ],
    2,
    "2026-07-31"
  );
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => p.date === "2026-07-01"), undefined);
});

test("fillTrendAxis — 오름차순(오래된 날 → 오늘). 차트 x축 방향 계약", () => {
  const out = fillTrendAxis([], 4, "2026-07-31");
  assert.deepEqual(out.map((p) => p.date), ["2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"]);
  assert.ok(out.every((p) => p.newUsers === 0 && p.readings === 0 && p.revenueWon === 0));
});
