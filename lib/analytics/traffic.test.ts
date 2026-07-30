import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickTodayYesterday,
  buildVisitorMix,
  pickTodayVisitorMix,
  fillTrafficAxis,
  withPvPerUv,
} from "./traffic.ts";

// ⚠️ 2026-07-31: 집계를 하던 순수 함수 7개(buildTrafficTrend·buildRouteRanking·buildAuthSplit·
//    buildEntrySources·buildBotShare·filterByBucket·mergeToday)와 그 테스트를 삭제했다.
//    2026-07-29 에 집계가 전부 Postgres RPC(admin_traffic_*)로 넘어가 **프로덕션 호출처가 0**
//    이었는데 테스트만 남아 "219/219 통과"가 거짓 안심을 주고 있었다 — 요청 경로에 없는 코드를
//    검증하고 있었던 것이다. 지금 남은 테스트는 전부 실제 요청 경로를 지난다.
//    집계 규칙(봇 제외·어드민 제외 3값 논리·KST 자정 버킷·first-touch)의 회귀 감지는
//    scripts/admin-expected-values.sql 정답지 대조와 lib/admin-time.test.ts 가 담당한다.

// ── 일별 추세 (RPC 행 → 화면용 변환) ─────────────────────────────────────────

test("fillTrafficAxis — 수집이 없던 날도 0 으로 축에 남는다", () => {
  const out = fillTrafficAxis([{ date: "2026-07-28", uv: 49, pv: 426 }], 3, "2026-07-28");
  assert.deepEqual(out.map((p) => p.date), ["2026-07-26", "2026-07-27", "2026-07-28"]);
  assert.deepEqual(out.map((p) => p.pv), [0, 0, 426]);
});

test("fillTrafficAxis — 축 밖(조회 경계 걸침) 날짜는 버린다", () => {
  const out = fillTrafficAxis(
    [
      { date: "2026-07-20", uv: 9, pv: 9 },
      { date: "2026-07-28", uv: 49, pv: 426 },
    ],
    2,
    "2026-07-28"
  );
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => p.date === "2026-07-20"), undefined);
});

test("pickTodayYesterday — 마지막 점=오늘 · 그 앞=어제", () => {
  const t = fillTrafficAxis(
    [
      { date: "2026-07-01", uv: 2, pv: 2 },
      { date: "2026-07-02", uv: 1, pv: 1 },
    ],
    2,
    "2026-07-02"
  );
  const { today, yesterday } = pickTodayYesterday(t);
  assert.equal(today.date, "2026-07-02");
  assert.deepEqual([today.uv, today.pv], [1, 1]);
  assert.equal(yesterday.date, "2026-07-01");
  assert.deepEqual([yesterday.uv, yesterday.pv], [2, 2]);
});

test("pickTodayYesterday — 빈 배열·1일치에서도 0 (Delta 가 '어제 0' 으로 뜬다)", () => {
  assert.deepEqual(pickTodayYesterday([]), {
    today: { date: "", uv: 0, pv: 0 },
    yesterday: { date: "", uv: 0, pv: 0 },
  });
  const one = fillTrafficAxis([], 1, "2026-07-02");
  assert.equal(pickTodayYesterday(one).today.date, "2026-07-02");
  assert.equal(pickTodayYesterday(one).yesterday.uv, 0);
});

test("withPvPerUv — PV/UV 는 소수 1자리, UV 0 이면 0", () => {
  const out = withPvPerUv([
    { path: "/", uv: 110, pv: 272, todayUv: 3, todayPv: 7 },
    { path: "/x", uv: 0, pv: 3, todayUv: 0, todayPv: 3 },
  ]);
  assert.equal(out[0].pvPerUv, 2.5);
  assert.equal(out[1].pvPerUv, 0);
});

// ── 방문자 구성 (RPC 결과의 표시 파생값) ──────────────────────────────────────

test("buildVisitorMix — 재방문율은 (연속+복귀)/UV, 소수 1자리", () => {
  const out = buildVisitorMix([
    { date: "2026-07-28", uv: 49, newUv: 43, streakUv: 6, backUv: 0 },
  ]);
  assert.equal(out[0].returningUv, 6);
  assert.equal(out[0].returningPct, 12.2);
});

test("buildVisitorMix — 3분할 합이 UV 와 같다는 SQL 계약을 문서화한다", () => {
  // prod 실측값(2026-07-28 버킷, KST 자정 · 세션 시작 귀속 · 어드민 제외).
  // SQL 이 배타적·완전을 보장하므로 앱은 합을 재계산하지 않는다 — 대신 이 불변식이
  // 깨지면 RPC 쪽 버그다(플랜 A Step 3 이 실제로 이 불변식으로 버그를 잡았다).
  const r = { date: "2026-07-28", uv: 49, newUv: 47, streakUv: 1, backUv: 1 };
  assert.equal(r.newUv + r.streakUv + r.backUv, r.uv);
  assert.equal(buildVisitorMix([r])[0].returningPct, 4.1);
});

test("buildVisitorMix — UV 0 이면 재방문율 0 (0 나누기 없음)", () => {
  const out = buildVisitorMix([
    { date: "2026-07-25", uv: 0, newUv: 0, streakUv: 0, backUv: 0 },
  ]);
  assert.equal(out[0].returningPct, 0);
});

test("buildVisitorMix — 빈 배열은 빈 배열 (throw 없음)", () => {
  assert.deepEqual(buildVisitorMix([]), []);
});

test("pickTodayVisitorMix — 마지막(최신) 점을 고른다", () => {
  const mix = buildVisitorMix([
    { date: "2026-07-27", uv: 52, newUv: 51, streakUv: 0, backUv: 1 },
    { date: "2026-07-28", uv: 49, newUv: 47, streakUv: 1, backUv: 1 },
  ]);
  assert.equal(pickTodayVisitorMix(mix).date, "2026-07-28");
});

test("pickTodayVisitorMix — 빈 배열이어도 0 인 점을 준다 (화면이 깨지지 않게)", () => {
  const t = pickTodayVisitorMix([]);
  assert.equal(t.uv, 0);
  assert.equal(t.newUv, 0);
  assert.equal(t.returningPct, 0);
});
