// lib/analytics/traffic.ts — page_views 행을 받아 UV/PV 를 집계하는 순수 함수들 (DB 접근 없음).
//
// 왜 필요한가: Meta 픽셀은 광고 상단(노출→클릭→랜딩→가입)까지만 보여준다. 클릭→랜딩 도달률은
// 96% 로 건강한데, 가입 이후 앱 내부 라우트 이탈은 계측이 없어 완전히 블라인드였다.
// "상담 대화의 47.4% 가 결과 화면에 도달하지 못한다"는 건 알지만 어느 화면에서 사라지는지는
// 알 수가 없었다 → 이 모듈의 1순위 목적은 buildRouteRanking (라우트별 이탈 지점 찾기).
//
// 공통 규칙:
// - UV = 구별되는 anon_id 수. anon_id 는 middleware 가 첫 진입에 발급하므로 사실상 항상 있지만,
//   없는 행(쿠키 발급 전 · 차단)은 UV 에 세지 않고 PV 만 기여한다 (하나로 뭉치면 UV 가 왜곡된다).
// - is_bot=true 는 모든 지표에서 제외한다. 섞이면 전환율이 전부 이유 없이 낮게 나온다.
//   대신 봇 비율만 buildBotShare 로 따로 본다 (계측 건강성 확인용).
// - 화면 표기는 UV → PV 순 ("몇 명이 왔고 그중 몇 번 봤나"). 타입 필드도 그 순서로 맞춘다.

import { adminKstDate } from "../admin-time";

export type PageViewRow = {
  anon_id: string | null;
  user_id: string | null;
  path: string;
  landing_variant: string | null;
  utm_content: string | null;
  is_bot: boolean;
  created_at: string;
};

/** utm/landing_variant 값이 없는 유입 묶음. */
export const DIRECT = "(직접/오가닉)";

/**
 * Meta URL 매크로가 치환되지 않고 리터럴로 도착한 유입 묶음 (`utm_content={{ad.name}}` 그대로).
 * Meta 는 클릭 시점에 매크로를 실제 소재명으로 바꿔주지만, 광고 미리보기 링크 · 광고 관리자에서
 * 목적지 URL 을 복사해 직접 열기 · 광고 게시물의 오가닉 공유 경로에서는 치환이 일어나지 않는다.
 * 실제 소재가 아니므로 소재명으로 세우면 표를 오염시킨다 → 별도 버킷으로 분리한다.
 */
export const UNRESOLVED_MACRO = "(매크로 미치환)";

/** `{{...}}` 형태면 미치환으로 접는다. URLSearchParams 가 이미 디코드하므로 %7B 형태는 안 온다. */
const normalizeEntryValue = (v: string): string =>
  /^\{\{.*\}\}$/.test(v.trim()) ? UNRESOLVED_MACRO : v;

/** 봇 제외 — 모든 지표의 공통 전처리. */
const humanRows = (rows: PageViewRow[]): PageViewRow[] => rows.filter((r) => !r.is_bot);

const pct1 = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

// ── 1. 일별 UV/PV 추세 ───────────────────────────────────────────────────────

export type TrafficPoint = { date: string; uv: number; pv: number };

/**
 * 일별 UV/PV. 날짜 버킷은 **오전 10시 롤오버**(adminKstDate) — 대시보드 KPI 와 같은 기준이다.
 * 자정 기준이면 밤사이 한 세션이 두 날짜로 쪼개져, 이 화면이 보려는 "그 세션이 어느 라우트에서
 * 끊겼나" 가 이틀에 걸쳐 반으로 잘려 보인다. (/admin/analytics 트렌드는 자정 기준 유지 — 섞지 말 것)
 */
export function buildTrafficTrend(input: {
  rows: PageViewRow[];
  days: number;
  todayBucket: string; // 'YYYY-MM-DD' (오전 10시 롤오버 기준 오늘)
}): TrafficPoint[] {
  // 날짜 축을 먼저 채운다 — 수집이 없던 날도 0 으로 나와야 "끊긴 구간"이 눈에 보인다.
  const uv = new Map<string, Set<string>>();
  const pv = new Map<string, number>();
  const base = new Date(`${input.todayBucket}T00:00:00Z`);
  for (let i = 0; i < input.days; i++) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    uv.set(d, new Set());
    pv.set(d, 0);
  }
  for (const r of humanRows(input.rows)) {
    const d = adminKstDate(r.created_at);
    if (!pv.has(d)) continue; // 축 밖(조회 경계 걸침) 행은 버린다
    pv.set(d, pv.get(d)! + 1);
    if (r.anon_id) uv.get(d)!.add(r.anon_id);
  }
  return [...pv.keys()]
    .map((d) => ({ date: d, uv: uv.get(d)!.size, pv: pv.get(d)! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 추세의 마지막 두 점 = 오늘·어제 (오전 10시 롤오버 버킷). 상단 "오늘 UV/PV + 어제 대비" 카드용.
 * buildTrafficTrend 가 날짜 축을 항상 채우고 오름차순 정렬하므로 마지막이 오늘이지만,
 * days=1 이나 빈 배열에서도 안전해야 한다 → 없는 쪽은 0 으로 준다 (Delta 가 "어제 0" 으로 뜬다).
 */
export function pickTodayYesterday(trend: TrafficPoint[]): { today: TrafficPoint; yesterday: TrafficPoint } {
  const zero = (date: string): TrafficPoint => ({ date, uv: 0, pv: 0 });
  return {
    today: trend[trend.length - 1] ?? zero(""),
    yesterday: trend[trend.length - 2] ?? zero(""),
  };
}

/** 봇 비율 — 계측 건강성 한 줄. 봇 PV 가 갑자기 치솟으면 UV/PV 해석 자체를 의심해야 한다. */
export type BotShare = { totalPv: number; botPv: number; botPct: number };

export function buildBotShare(rows: PageViewRow[]): BotShare {
  const botPv = rows.reduce((n, r) => n + (r.is_bot ? 1 : 0), 0);
  return { totalPv: rows.length, botPv, botPct: pct1(botPv, rows.length) };
}

// ── 2. 라우트별 UV·PV (이 화면의 핵심) ───────────────────────────────────────

export type RouteRow = {
  path: string;
  uv: number;
  pv: number;
  /** PV/UV — 재방문 강도. 1 에 가까우면 "한 번 보고 떠남", 높으면 머물거나 되돌아온 화면. */
  pvPerUv: number;
};

export function buildRouteRanking(rows: PageViewRow[], limit = 20): RouteRow[] {
  const g = new Map<string, { pv: number; uv: Set<string> }>();
  for (const r of humanRows(rows)) {
    const e = g.get(r.path) ?? { pv: 0, uv: new Set<string>() };
    e.pv += 1;
    if (r.anon_id) e.uv.add(r.anon_id);
    g.set(r.path, e);
  }
  return [...g.entries()]
    .map(([path, e]) => ({
      path,
      uv: e.uv.size,
      pv: e.pv,
      pvPerUv: e.uv.size ? Math.round((e.pv / e.uv.size) * 10) / 10 : 0,
    }))
    // 순위는 PV 내림차순 유지 — 표시 순서(UV·PV)와 별개. 바꾸면 상위 N개 구성이 달라진다.
    .sort((a, b) => b.pv - a.pv || b.uv - a.uv)
    .slice(0, limit);
}

// ── 3. 로그인 전/후 ──────────────────────────────────────────────────────────

export type AuthSplitRow = { segment: "guest" | "member"; uv: number; pv: number };

/**
 * user_id 유무로 UV·PV 분해. 이 비콘의 존재 이유가 "가입 이후 이탈" 이라 이 분해가 중요하다.
 * 주의: 같은 anon_id 가 로그인 전/후 양쪽에 나타난다(가입 순간 브리지) → 두 UV 합은 전체 UV 보다 클 수 있다.
 * 빈 데이터에서도 두 행을 항상 반환한다 (화면 표가 사라지지 않게).
 */
export function buildAuthSplit(rows: PageViewRow[]): AuthSplitRow[] {
  const guest = { pv: 0, uv: new Set<string>() };
  const member = { pv: 0, uv: new Set<string>() };
  for (const r of humanRows(rows)) {
    const b = r.user_id ? member : guest;
    b.pv += 1;
    if (r.anon_id) b.uv.add(r.anon_id);
  }
  return [
    { segment: "guest", uv: guest.uv.size, pv: guest.pv },
    { segment: "member", uv: member.uv.size, pv: member.pv },
  ];
}

// ── 4. 유입별 (landing_variant · utm_content) ────────────────────────────────

export type EntryRow = { key: string; uv: number; pv: number };
export type EntrySources = { variants: EntryRow[]; contents: EntryRow[] };

/**
 * 유입 소재별 UV·PV. 방문자 최초 귀속(first-touch)으로 계산한다.
 *
 * 왜 행 단위로 그룹하지 않는가: 비콘(components/analytics/PageViewBeacon.tsx)은 utm 이 URL 에
 * 실려 있는 그 1건에만 값을 담아 보낸다. 행 단위로 묶으면 랜딩 1건만 소재에 잡히고 그 방문자의
 * 나머지 PV 는 전부 (직접/오가닉) 으로 흘러가 표가 무의미해진다 → anon_id 의 가장 이른 값으로
 * 그 방문자의 모든 행을 귀속시킨다.
 */
export function buildEntrySources(rows: PageViewRow[]): EntrySources {
  const human = humanRows(rows);
  const byTime = [...human].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstVariant = new Map<string, string>();
  const firstContent = new Map<string, string>();
  for (const r of byTime) {
    if (!r.anon_id) continue;
    if (r.landing_variant && !firstVariant.has(r.anon_id))
      firstVariant.set(r.anon_id, normalizeEntryValue(r.landing_variant));
    if (r.utm_content && !firstContent.has(r.anon_id))
      firstContent.set(r.anon_id, normalizeEntryValue(r.utm_content));
  }

  const group = (
    attributed: Map<string, string>,
    ownValue: (r: PageViewRow) => string | null
  ): EntryRow[] => {
    const g = new Map<string, { pv: number; uv: Set<string> }>();
    for (const r of human) {
      // anon_id 없는 행은 귀속 불가 → 자기 행의 값으로만 PV 기여 (UV 는 세지 않음)
      const own = r.anon_id ? attributed.get(r.anon_id) : ownValue(r);
      const key = own ? normalizeEntryValue(own) : DIRECT;
      const e = g.get(key) ?? { pv: 0, uv: new Set<string>() };
      e.pv += 1;
      if (r.anon_id) e.uv.add(r.anon_id);
      g.set(key, e);
    }
    // (직접/오가닉) 은 대개 압도적이라 맨 위에 두면 소재 행이 안 보인다 → 맨 아래로
    return [...g.entries()]
      .map(([key, e]) => ({ key, uv: e.uv.size, pv: e.pv }))
      .sort((a, b) => {
        const d = (a.key === DIRECT ? 1 : 0) - (b.key === DIRECT ? 1 : 0);
        return d !== 0 ? d : b.uv - a.uv || b.pv - a.pv;
      });
  };

  return {
    variants: group(firstVariant, (r) => r.landing_variant),
    contents: group(firstContent, (r) => r.utm_content),
  };
}

// ── 5. "오늘" 열 붙이기 ──────────────────────────────────────────────────────
//
// 표마다 최근 N일과 오늘을 나란히 본다. 두 값을 같은 원본 배열에서 뽑아야(같은 봇 제외·같은
// 어드민 제외·같은 10시 롤오버) 두 열이 같은 정의로 비교된다 → 조회를 한 번 더 하지 않고
// 행을 버킷으로 걸러 같은 집계 함수를 두 번 돌린다.

/** 오늘 버킷(오전 10시 롤오버)에 속한 행만. `todayBucket` 은 adminKstDate 결과와 같은 형식. */
export function filterByBucket(rows: PageViewRow[], bucket: string): PageViewRow[] {
  return rows.filter((r) => adminKstDate(r.created_at) === bucket);
}

export type WithToday<T> = T & { todayUv: number; todayPv: number };

/**
 * 기간 집계(`all`)에 같은 키의 오늘 값을 붙인다. **행 구성·순서는 `all` 을 그대로 유지** —
 * 오늘 값으로 재정렬하면 순위가 매 시간 흔들려 "어느 라우트에서 새는가"를 못 읽는다.
 * 오늘 없던 키는 0/0. 반대로 오늘만 활동하고 기간 상위 N 에 못 든 키는 표에 안 나온다
 * (라우트 표의 limit 때문 — 유입·로그인 표는 slice 가 없어 해당 없음).
 */
export function mergeToday<T extends { uv: number; pv: number }>(
  all: T[],
  today: T[],
  keyOf: (row: T) => string
): WithToday<T>[] {
  const byKey = new Map(today.map((r) => [keyOf(r), r]));
  return all.map((r) => {
    const t = byKey.get(keyOf(r));
    return { ...r, todayUv: t?.uv ?? 0, todayPv: t?.pv ?? 0 };
  });
}
