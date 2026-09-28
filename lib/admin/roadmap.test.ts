// lib/admin/roadmap.test.ts — 3층 판정 규칙의 계약.
//
// 🔴 여기서 지키는 건 "코드가 돈다"가 아니라 **판정선이 로드맵 §3 과 같은가**이다.
//    베이스라인·목표선이 조용히 어긋나면 화면은 멀쩡히 렌더되면서 틀린 판정을 낸다 —
//    3층의 존재 이유가 통째로 사라지는 실패 모드라 경계값까지 못박는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROADMAP_KPIS,
  judge,
  HOLIDAYS_2026,
  kpiByColumn,
  parseRoadmapWindow,
} from "./roadmap.ts";

test("Primary 는 고래 캡 지표이고 베이스라인·목표선이 로드맵 §3 과 같다", () => {
  const primary = kpiByColumn("rev_ps_whalecap20k")!;
  assert.equal(primary.baseline, 252);
  assert.equal(primary.target, 394);
  assert.equal(primary.floor, 200);
  assert.equal(primary.direction, "up");
});

test("judge — up 방향: 목표 이상이면 good, 바닥 이하면 bad, 사이는 watch", () => {
  const k = kpiByColumn("rev_ps_whalecap20k")!;
  assert.equal(judge(k, 400), "good");
  assert.equal(judge(k, 300), "watch");
  assert.equal(judge(k, 200), "bad"); // 경계 포함
  assert.equal(judge(k, null), "unknown");
});

// 🔴 경계값을 따로 못박는다 — 로드맵 §3 Primary 는 "≥₩394 → 스위치 ON / ≤₩200 → 되돌리기"라
//    양쪽 다 **경계를 포함**한다. 위 테스트의 400·200 만으로는 이게 안 잠긴다.
test("judge — Primary 의 경계는 로드맵 문구 그대로 양쪽 다 포함이다", () => {
  const k = kpiByColumn("rev_ps_whalecap20k")!;
  assert.equal(judge(k, 394), "good"); // "≥₩394"
  assert.equal(judge(k, 393), "watch");
  assert.equal(judge(k, 201), "watch");
  assert.equal(judge(k, 200), "bad"); // "≤₩200"
});

test("judge — down 방향(무언 이탈): 목표 이하면 good", () => {
  const k = kpiByColumn("silent_exit_pct")!;
  assert.equal(k.direction, "down");
  assert.equal(judge(k, 21), "good");
  assert.equal(judge(k, 27.7), "watch"); // 베이스라인 그대로 = 변화 없음
});

// 🔴 로드맵 §3 턴마무리는 "무언 이탈 **<22%** 이면 성공"이다 — 정확히 22.0% 는 성공이 아니다.
//    `silent_exit_pct` 는 SQL 에서 소수 1자리로 반올림되므로 22.0 은 실제로 나올 수 있는 값이고,
//    여기서 good 을 내면 화면이 "성공"이라 말하며 Phase 3 페르소나 A/B 를 잘못 취소시킨다.
test("judge — 무언 이탈 22.0% 는 아직 성공이 아니다 (로드맵은 '<22%')", () => {
  const k = kpiByColumn("silent_exit_pct")!;
  assert.equal(judge(k, 22), "watch");
  assert.equal(judge(k, 21.9), "good");
});

test("judge — 가드레일은 floor 만 있다: 바닥 위면 good", () => {
  const k = kpiByColumn("first_reading_pct")!;
  assert.equal(k.target, undefined);
  assert.equal(judge(k, 85), "good");
  assert.equal(judge(k, 79), "bad");
});

// 🔴 가드레일 문구는 "**<80%** 면 온보딩 회귀 즉시 조사"다 — 정확히 80.0% 는 아직 경보가 아니다.
//    Primary 의 "≤₩200" 과 경계 방향이 반대라, 하나의 규칙으로 뭉뚱그리면 둘 중 하나가 틀린다.
test("judge — 가드레일 바닥은 배타다 (로드맵은 '<80%')", () => {
  const k = kpiByColumn("first_reading_pct")!;
  assert.equal(judge(k, 80), "good");
  assert.equal(judge(k, 79.9), "bad");
});

test("judge — 목표선도 바닥도 없는 참고 지표는 ref", () => {
  const k = kpiByColumn("arppu")!;
  assert.equal(judge(k, 3392), "ref");
});

// 🔴 6일 전부를 단언한다 — 셋만 확인하면 나머지 셋이 빠져도 테스트가 안 깨진다.
//    로드맵 §0-4: "추석(09-24~27)·개천절(10-03)·한글날(10-09) 가입은 판정에서 뺀다" = 총 6일.
//    추석은 하루가 아니라 나흘이다.
test("공휴일 목록은 추석 4일 + 개천절 + 한글날 = 6일 전부다", () => {
  assert.deepEqual([...HOLIDAYS_2026], [
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
    "2026-09-27",
    "2026-10-03",
    "2026-10-09",
  ]);
});

test("모든 KPI 가 고유한 컬럼명을 갖는다", () => {
  const cols = ROADMAP_KPIS.map((k) => k.column);
  assert.equal(new Set(cols).size, cols.length);
});

// 🔴 컬럼명 오타는 크래시가 아니라 **모든 카드가 영원히 `—`** 로 뜨는 조용한 실패다.
//    마이그레이션의 RETURNS TABLE 을 읽어 실제 컬럼 집합과 대조한다.
test("모든 KPI 컬럼이 admin_roadmap_kpi 의 반환 컬럼에 실제로 있다", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20260921030000_admin_roadmap_kpi.sql", import.meta.url),
    "utf8"
  );
  const start = sql.indexOf("RETURNS TABLE (");
  const end = sql.indexOf("LANGUAGE sql");
  assert.ok(start > 0 && end > start, "RETURNS TABLE 블록을 못 찾았다 — 파서가 깨졌다");
  const cols = new Set(
    [...sql.slice(start, end).matchAll(/^\s+(\w+)\s+(?:BIGINT|NUMERIC)/gm)].map((m) => m[1])
  );
  assert.ok(cols.size >= 20, `반환 컬럼 파싱 실패 (${cols.size}개) — 정규식을 확인할 것`);
  for (const k of ROADMAP_KPIS) {
    assert.ok(cols.has(k.column), `${k.column} 은 admin_roadmap_kpi 반환에 없다`);
  }
});

// 🔴 admin_roadmap_kpi 는 `created_at < p_until` 을 무조건 쓴다 — p_until 이 NULL/빈 값이면
//    에러가 아니라 **조용히 코호트 0명**이 된다(`< NULL` → NULL). 화면은 "가입 0명"을 그리고
//    운영자는 "가입이 없었나"로 읽는다. 창을 만드는 이 함수가 유일한 방어선이다.
test("창은 어떤 입력에서도 닫혀 있다 — p_until 이 빈 적이 없다", () => {
  const cases: Record<string, string | string[] | undefined>[] = [
    {},
    { since: "", until: "" },
    { since: "abc", until: "2026-13-99abc" },
    { until: ["", "2026-10-01"] },
    { since: "2026-09-01", until: "2026-09-21" },
    // 🔴 역전 입력도 until 은 닫혀 있어야 한다(역전 자체를 막는지는 아래 테스트가 따로 단언).
    { since: "2026-10-01", until: "2026-09-01" },
  ];
  for (const sp of cases) {
    const w = parseRoadmapWindow(sp);
    assert.ok(w.until.length > 0, `until 이 비었다: ${JSON.stringify(sp)}`);
    assert.ok(!Number.isNaN(Date.parse(w.until)), `until 이 파싱 불가: ${w.until}`);
    assert.ok(!Number.isNaN(Date.parse(w.since)), `since 가 파싱 불가: ${w.since}`);
  }
});

// 🔴 이전 판은 `since < until` 을 5개 케이스에 걸었는데 **역전을 만들 수 있는 입력이 하나도
//    없어** 아무것도 안 잡았다. 지키는 척하는 단언을 실제 동작 단언으로 바꾼다.
//    현재 동작 = **역전을 막지 않고 그대로 넘긴다.** 조용히 기본 창으로 강등하면 화면이
//    "입력한 창이 아닌 숫자"를 멀쩡히 보여주기 때문이다. 역전은 코호트 0명 → 앰버 경고로 보인다.
test("창 역전은 강등하지 않고 그대로 넘긴다 — 0명 경고가 드러내는 쪽이 낫다", () => {
  const w = parseRoadmapWindow({ since: "2026-10-01", until: "2026-09-01" });
  assert.equal(w.since, "2026-10-01T00:00:00+09:00");
  assert.equal(w.until, "2026-09-01T00:00:00+09:00");
  assert.ok(Date.parse(w.since) > Date.parse(w.until), "역전이 보존되지 않았다");
});

// 🔴 정규식은 형식만 본다 — 달력상 불가능한 날짜가 새면 창이 조용히 달라진다.
//    특히 2026-02-31 은 `Date.parse` 를 **통과해** 3월 3일로 굴러가므로 왕복 비교가 필요했다.
test("달력상 불가능한 날짜는 통과하지 못한다 — 롤오버까지 막는다", () => {
  for (const bad of ["2026-13-45", "2026-02-31", "2026-04-31", "2026-00-10", "2026-09-00"]) {
    const w = parseRoadmapWindow({ since: bad, until: bad });
    assert.notEqual(w.since, `${bad}T00:00:00+09:00`, `${bad} 가 창으로 새어 들어갔다`);
    assert.ok(w.until.endsWith("Z"), `${bad} 가 until 로 새어 들어갔다`);
  }
  // 롤오버가 실제로 막혔는지 직접 — 2026-02-31 이 3월 3일 창으로 둔갑하면 안 된다.
  const rolled = parseRoadmapWindow({ since: "2026-02-31" });
  assert.notEqual(rolled.since, "2026-03-03T00:00:00+09:00");
});

test("창은 YYYY-MM-DD 파라미터만 받아들인다 — 형식이 틀리면 기본 창으로 떨어진다", () => {
  const good = parseRoadmapWindow({ since: "2026-09-01", until: "2026-09-21" });
  assert.equal(good.since, "2026-09-01T00:00:00+09:00");
  assert.equal(good.until, "2026-09-21T00:00:00+09:00");
  const bad = parseRoadmapWindow({ since: "2026/09/01", until: "nope" });
  assert.notEqual(bad.since, "2026/09/01T00:00:00+09:00");
  assert.ok(bad.until.endsWith("Z"), "기본값은 lib/admin-time 의 UTC ISO 다");
});
