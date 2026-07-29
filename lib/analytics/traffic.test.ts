import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrafficTrend,
  pickTodayYesterday,
  buildBotShare,
  buildRouteRanking,
  buildAuthSplit,
  buildEntrySources,
  filterByBucket,
  mergeToday,
  buildVisitorMix,
  pickTodayVisitorMix,
  fillTrafficAxis,
  withPvPerUv,
  DIRECT,
  UNRESOLVED_MACRO,
  type PageViewRow,
} from "./traffic.ts";
import { adminKstDate } from "../admin-time.ts";
import { kstDate } from "./aggregate.ts"; // 자정 기준 — 두 기준이 실제로 갈리는지 대조용

/** 테스트용 행 팩토리 — 기본은 사람(is_bot=false) · 비로그인 · utm 없음. */
function R(p: Partial<PageViewRow> & { created_at: string }): PageViewRow {
  return {
    anon_id: "a1",
    user_id: null,
    path: "/",
    landing_variant: null,
    utm_content: null,
    is_bot: false,
    ...p,
  };
}

test("buildTrafficTrend — UV=구별 anon_id · PV=행수 · 봇 제외 · 일자 버킷", () => {
  const t = buildTrafficTrend({
    rows: [
      R({ anon_id: "a1", created_at: "2026-07-01T02:00:00Z" }), // 07-01 11:00 KST
      R({ anon_id: "a1", created_at: "2026-07-01T03:00:00Z" }), // 같은 방문자 → UV 1
      R({ anon_id: "a2", created_at: "2026-07-01T04:00:00Z" }),
      R({ anon_id: "a3", created_at: "2026-07-02T02:00:00Z" }), // 07-02 11:00 KST → 다음 버킷
      R({ anon_id: "bot", created_at: "2026-07-01T05:00:00Z", is_bot: true }), // 제외
    ],
    days: 2,
    todayBucket: "2026-07-02",
  });
  const d1 = t.find((p) => p.date === "2026-07-01")!;
  assert.equal(d1.pv, 3);
  assert.equal(d1.uv, 2); // a1(2행) + a2
  const d2 = t.find((p) => p.date === "2026-07-02")!;
  assert.equal(d2.pv, 1);
  assert.equal(d2.uv, 1);
  assert.deepEqual(t.map((p) => p.date), ["2026-07-01", "2026-07-02"]); // 오름차순
});

test("buildTrafficTrend — anon_id 없는 행은 PV 만 기여 (UV 로 뭉치지 않음)", () => {
  const t = buildTrafficTrend({
    rows: [
      R({ anon_id: null, created_at: "2026-07-01T02:00:00Z" }),
      R({ anon_id: null, created_at: "2026-07-01T03:00:00Z" }),
    ],
    days: 1,
    todayBucket: "2026-07-01",
  });
  assert.equal(t[0].pv, 2);
  assert.equal(t[0].uv, 0);
});

test("buildTrafficTrend — 빈 데이터에서도 날짜 축이 0 으로 채워짐", () => {
  const t = buildTrafficTrend({ rows: [], days: 3, todayBucket: "2026-07-03" });
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((p) => p.date), ["2026-07-01", "2026-07-02", "2026-07-03"]);
  assert.ok(t.every((p) => p.uv === 0 && p.pv === 0));
});

test("buildTrafficTrend — 조회 창 밖 행은 버린다(축 오염 방지)", () => {
  const t = buildTrafficTrend({
    rows: [R({ created_at: "2026-06-01T02:00:00Z" })], // 축(07-03 하루) 밖
    days: 1,
    todayBucket: "2026-07-03",
  });
  assert.equal(t.length, 1);
  assert.equal(t[0].pv, 0);
});

// ── 오전 10시 롤오버 경계 ────────────────────────────────────────────────────
// 이 화면은 "밤사이 한 세션이 어느 라우트에서 끊겼나" 를 본다. 자정 기준이면 그 세션이 두
// 날짜로 쪼개져 반쪽만 보인다 → 대시보드 KPI 와 같은 오전 10시 롤오버를 쓴다.

test("adminKstDate — 09:59 KST=전날 · 10:00 KST=당일 · 자정 직후(00:30 KST)=전날", () => {
  assert.equal(adminKstDate("2026-07-02T00:59:00Z"), "2026-07-01"); // 07-02 09:59 KST → 전날
  assert.equal(adminKstDate("2026-07-02T01:00:00Z"), "2026-07-02"); // 07-02 10:00 KST → 당일 (컷오프 정각)
  assert.equal(adminKstDate("2026-07-01T15:30:00Z"), "2026-07-01"); // 07-02 00:30 KST → 전날
  // 자정을 넘긴 같은 밤(23:30 → 00:30)이 한 버킷에 남는 것이 이 기준의 존재 이유
  assert.equal(adminKstDate("2026-07-01T14:30:00Z"), adminKstDate("2026-07-01T15:30:00Z"));
  // 반대로 자정 기준(/admin/analytics 가 쓰는 kstDate)이면 갈라진다 — 두 기준은 섞으면 안 된다
  assert.notEqual(kstDate("2026-07-01T14:30:00Z"), kstDate("2026-07-01T15:30:00Z"));
});

test("buildTrafficTrend — 밤사이 세션이 한 버킷에 남고 10:00 KST 에서 넘어간다", () => {
  const t = buildTrafficTrend({
    rows: [
      R({ anon_id: "a1", created_at: "2026-07-01T14:30:00Z" }), // 07-01 23:30 KST
      R({ anon_id: "a1", created_at: "2026-07-01T15:30:00Z" }), // 07-02 00:30 KST — 같은 밤
      R({ anon_id: "a1", created_at: "2026-07-02T00:59:00Z" }), // 07-02 09:59 KST — 아직 같은 버킷
      R({ anon_id: "a2", created_at: "2026-07-02T01:00:00Z" }), // 07-02 10:00 KST — 여기서 넘어간다
    ],
    days: 2,
    todayBucket: "2026-07-02",
  });
  const d1 = t.find((p) => p.date === "2026-07-01")!;
  assert.equal(d1.pv, 3);
  assert.equal(d1.uv, 1); // a1 의 밤 세션이 두 날짜로 쪼개지지 않았다
  const d2 = t.find((p) => p.date === "2026-07-02")!;
  assert.equal(d2.pv, 1);
  assert.equal(d2.uv, 1);
});

test("pickTodayYesterday — 마지막 점=오늘 · 그 앞=어제", () => {
  const t = buildTrafficTrend({
    rows: [
      R({ anon_id: "a1", created_at: "2026-07-02T02:00:00Z" }), // 오늘 버킷
      R({ anon_id: "a2", created_at: "2026-07-01T02:00:00Z" }), // 어제 버킷
      R({ anon_id: "a3", created_at: "2026-07-01T03:00:00Z" }),
    ],
    days: 2,
    todayBucket: "2026-07-02",
  });
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
  const one = buildTrafficTrend({ rows: [], days: 1, todayBucket: "2026-07-02" });
  assert.equal(pickTodayYesterday(one).today.date, "2026-07-02");
  assert.equal(pickTodayYesterday(one).yesterday.uv, 0);
});

test("buildBotShare — 봇 비율 (빈 배열은 0, throw 없음)", () => {
  const s = buildBotShare([
    R({ created_at: "2026-07-01T00:00:00Z" }),
    R({ created_at: "2026-07-01T00:00:00Z" }),
    R({ created_at: "2026-07-01T00:00:00Z", is_bot: true }),
  ]);
  assert.equal(s.totalPv, 3);
  assert.equal(s.botPv, 1);
  assert.equal(s.botPct, 33.3);
  assert.deepEqual(buildBotShare([]), { totalPv: 0, botPv: 0, botPct: 0 });
});

test("buildRouteRanking — path 별 PV·UV·PV/UV, PV 내림차순 + limit", () => {
  const rows = [
    R({ path: "/tarot/reading", anon_id: "a1", created_at: "2026-07-01T00:00:00Z" }),
    R({ path: "/tarot/reading", anon_id: "a1", created_at: "2026-07-01T01:00:00Z" }),
    R({ path: "/tarot/reading", anon_id: "a2", created_at: "2026-07-01T02:00:00Z" }),
    R({ path: "/tarot/result", anon_id: "a1", created_at: "2026-07-01T03:00:00Z" }),
    R({ path: "/bot-only", anon_id: "b1", created_at: "2026-07-01T04:00:00Z", is_bot: true }),
  ];
  const top = buildRouteRanking(rows);
  assert.equal(top.length, 2); // 봇 전용 라우트는 사라진다
  assert.equal(top[0].path, "/tarot/reading");
  assert.equal(top[0].pv, 3);
  assert.equal(top[0].uv, 2);
  assert.equal(top[0].pvPerUv, 1.5);
  // 이탈 지점 판독: reading UV 2 → result UV 1 (절반이 결과까지 못 감)
  assert.equal(top[1].path, "/tarot/result");
  assert.equal(top[1].uv, 1);
  assert.equal(buildRouteRanking(rows, 1).length, 1);
  assert.deepEqual(buildRouteRanking([]), []);
});

test("buildRouteRanking — UV 0(anon_id 없음)이면 PV/UV 는 0 (0 나눗셈 방지)", () => {
  const top = buildRouteRanking([R({ path: "/x", anon_id: null, created_at: "2026-07-01T00:00:00Z" })]);
  assert.equal(top[0].pv, 1);
  assert.equal(top[0].uv, 0);
  assert.equal(top[0].pvPerUv, 0);
});

test("buildAuthSplit — user_id 유무로 분해 · 브리지 방문자는 양쪽에 계상", () => {
  const s = buildAuthSplit([
    R({ anon_id: "a1", user_id: null, created_at: "2026-07-01T00:00:00Z" }), // 로그인 전
    R({ anon_id: "a1", user_id: "u1", created_at: "2026-07-01T01:00:00Z" }), // 같은 방문자, 로그인 후
    R({ anon_id: "a2", user_id: null, created_at: "2026-07-01T02:00:00Z" }),
    R({ anon_id: "b1", user_id: "u9", created_at: "2026-07-01T03:00:00Z", is_bot: true }), // 제외
  ]);
  const guest = s.find((r) => r.segment === "guest")!;
  const member = s.find((r) => r.segment === "member")!;
  assert.equal(guest.pv, 2);
  assert.equal(guest.uv, 2); // a1, a2
  assert.equal(member.pv, 1);
  assert.equal(member.uv, 1); // a1 — 양쪽에 계상됨(합 3 > 전체 UV 2)
});

test("buildAuthSplit — 빈 데이터에서도 두 행 유지", () => {
  assert.deepEqual(buildAuthSplit([]), [
    { segment: "guest", uv: 0, pv: 0 },
    { segment: "member", uv: 0, pv: 0 },
  ]);
});

test("buildEntrySources — first-touch 귀속: 랜딩 이후 PV 도 소재에 붙는다", () => {
  const e = buildEntrySources([
    // a1: /start?v=love 로 랜딩(utm_content=love_a) → 이후 3건은 utm 없이 찍힘
    R({ anon_id: "a1", path: "/start", landing_variant: "love", utm_content: "love_a", created_at: "2026-07-01T00:00:00Z" }),
    R({ anon_id: "a1", path: "/", created_at: "2026-07-01T00:01:00Z" }),
    R({ anon_id: "a1", path: "/concern", created_at: "2026-07-01T00:02:00Z" }),
    // a2: utm 한 번도 없음 → (직접/오가닉)
    R({ anon_id: "a2", path: "/", created_at: "2026-07-01T00:03:00Z" }),
  ]);
  const love = e.contents.find((r) => r.key === "love_a")!;
  assert.equal(love.uv, 1);
  assert.equal(love.pv, 3); // 랜딩 이후 PV 까지 귀속 — 행 단위 그룹이면 1 로 나온다
  const direct = e.contents.find((r) => r.key === DIRECT)!;
  assert.equal(direct.uv, 1);
  assert.equal(direct.pv, 1);
  assert.equal(e.contents[e.contents.length - 1].key, DIRECT); // 맨 아래 정렬
  const variant = e.variants.find((r) => r.key === "love")!;
  assert.equal(variant.pv, 3);
});

test("buildEntrySources — 늦게 도착한 다른 소재는 최초 값을 덮지 않는다", () => {
  const e = buildEntrySources([
    R({ anon_id: "a1", utm_content: "second", created_at: "2026-07-02T00:00:00Z" }),
    R({ anon_id: "a1", utm_content: "first", created_at: "2026-07-01T00:00:00Z" }), // 입력 순서 무관, 시간순 최초
  ]);
  assert.equal(e.contents.length, 1);
  assert.equal(e.contents[0].key, "first");
  assert.equal(e.contents[0].pv, 2);
});

test("buildEntrySources — 빈 데이터는 빈 배열 (throw 없음)", () => {
  assert.deepEqual(buildEntrySources([]), { variants: [], contents: [] });
});

test("buildEntrySources — 치환 안 된 Meta 매크로는 소재명이 아니라 미치환 버킷", () => {
  const e = buildEntrySources([
    R({ anon_id: "a1", utm_content: "{{ad.name}}", created_at: "2026-07-01T00:00:00Z" }),
    R({ anon_id: "a2", utm_content: " {{ad.name}} ", created_at: "2026-07-01T01:00:00Z" }), // 공백 있어도 같은 버킷
    R({ anon_id: "a3", utm_content: "ad_love_feed", created_at: "2026-07-01T02:00:00Z" }),
  ]);
  const macro = e.contents.find((r) => r.key === UNRESOLVED_MACRO)!;
  assert.equal(macro.uv, 2, "두 방문자가 같은 미치환 버킷으로 묶인다");
  assert.ok(e.contents.some((r) => r.key === "ad_love_feed"), "실제 소재는 그대로 남는다");
  assert.ok(!e.contents.some((r) => r.key.includes("{{")), "리터럴 매크로가 소재명으로 새지 않는다");
});

test("buildEntrySources — 미치환 매크로 귀속도 first-touch (뒤따르는 PV 전부 흡수)", () => {
  const e = buildEntrySources([
    R({ anon_id: "a1", utm_content: "{{ad.name}}", created_at: "2026-07-01T00:00:00Z" }),
    R({ anon_id: "a1", path: "/tarot", created_at: "2026-07-01T00:01:00Z" }),
  ]);
  assert.equal(e.contents.length, 1);
  assert.equal(e.contents[0].key, UNRESOLVED_MACRO);
  assert.equal(e.contents[0].pv, 2);
});

test("filterByBucket — 오늘 버킷만 남기고 10시 롤오버를 따른다", () => {
  const rows = [
    R({ created_at: "2026-07-02T02:00:00Z" }), // 07-02 11:00 KST → 07-02 버킷
    R({ created_at: "2026-07-02T00:30:00Z" }), // 07-02 09:30 KST → 10시 전이므로 07-01 버킷
    R({ created_at: "2026-07-01T05:00:00Z" }),
  ];
  const today = filterByBucket(rows, "2026-07-02");
  assert.equal(today.length, 1);
  assert.equal(today[0].created_at, "2026-07-02T02:00:00Z");
  // 경계 행이 어느 버킷인지 명시적으로 대조 (10시 롤오버가 실제로 작동하는지)
  assert.equal(adminKstDate("2026-07-02T00:30:00Z"), "2026-07-01");
});

test("mergeToday — 기간 순서 유지 · 오늘 없는 키는 0 · 오늘만 있는 키는 추가되지 않음", () => {
  const all = [
    { path: "/", uv: 10, pv: 30, pvPerUv: 3 },
    { path: "/tarot", uv: 5, pv: 8, pvPerUv: 1.6 },
  ];
  const today = [
    { path: "/tarot", uv: 2, pv: 2, pvPerUv: 1 },
    { path: "/mypage", uv: 1, pv: 1, pvPerUv: 1 }, // all 에 없음 → 무시
  ];
  const merged = mergeToday(all, today, (r) => r.path);
  assert.deepEqual(merged.map((r) => r.path), ["/", "/tarot"], "순서·구성은 기간 집계 그대로");
  assert.equal(merged[0].todayUv, 0);
  assert.equal(merged[0].todayPv, 0);
  assert.equal(merged[1].todayUv, 2);
  assert.equal(merged[1].todayPv, 2);
  assert.equal(merged[0].uv, 10, "기간 값은 보존");
});

test("mergeToday — 로그인 전/후 세그먼트에도 같은 헬퍼가 쓰인다", () => {
  const merged = mergeToday(
    buildAuthSplit([R({ anon_id: "a1", user_id: "u1", created_at: "2026-07-01T00:00:00Z" })]),
    buildAuthSplit([]),
    (r) => r.segment
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.segment === "member")!.pv, 1);
  assert.equal(merged.find((r) => r.segment === "member")!.todayPv, 0);
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
  // prod 실측값(2026-07-27 버킷). SQL 이 배타적·완전을 보장하므로 앱은 합을 재계산하지 않는다.
  const r = { date: "2026-07-27", uv: 57, newUv: 52, streakUv: 3, backUv: 2 };
  assert.equal(r.newUv + r.streakUv + r.backUv, r.uv);
  assert.equal(buildVisitorMix([r])[0].returningPct, 8.8);
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
    { date: "2026-07-27", uv: 57, newUv: 52, streakUv: 3, backUv: 2 },
    { date: "2026-07-28", uv: 49, newUv: 43, streakUv: 6, backUv: 0 },
  ]);
  assert.equal(pickTodayVisitorMix(mix).date, "2026-07-28");
});

test("pickTodayVisitorMix — 빈 배열이어도 0 인 점을 준다 (화면이 깨지지 않게)", () => {
  const t = pickTodayVisitorMix([]);
  assert.equal(t.uv, 0);
  assert.equal(t.newUv, 0);
  assert.equal(t.returningPct, 0);
});

// ── RPC 행 → 화면용 변환 ──────────────────────────────────────────────────────

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

test("withPvPerUv — PV/UV 는 소수 1자리, UV 0 이면 0", () => {
  const out = withPvPerUv([
    { path: "/", uv: 110, pv: 272, todayUv: 3, todayPv: 7 },
    { path: "/x", uv: 0, pv: 3, todayUv: 0, todayPv: 3 },
  ]);
  assert.equal(out[0].pvPerUv, 2.5);
  assert.equal(out[1].pvPerUv, 0);
});
