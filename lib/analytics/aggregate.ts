// lib/analytics/aggregate.ts — 조회한 행을 받아 집계하는 순수 함수들.
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export type ReadingRow = {
  user_id: string;
  consultation_type: "saju" | "tarot" | "relationship";
  emotion_tag: string | null;
  saju_product: string | null;
  stars_spent: number | null;
  created_at: string;
};

export type PaymentRow = {
  user_id: string;
  amount_won: number | null;
  package_type: string | null;
  status: string | null;
  created_at: string;
};

export type CounselGroup = {
  emotionTag: string;
  consultationType: "saju" | "tarot";
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type FortuneGroup = {
  kind: string;
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type PackageGroup = {
  packageType: string;
  count: number;
  revenueWon: number;
};
export type ProductBreakdown = {
  counsel: CounselGroup[];
  fortune: FortuneGroup[];
  packages: PackageGroup[];
};

export function buildProductBreakdown(
  readings: ReadingRow[],
  payments: PaymentRow[]
): ProductBreakdown {
  const counsel = new Map<string, CounselGroup>();
  const fortune = new Map<string, FortuneGroup>();

  for (const r of readings) {
    const paid = (r.stars_spent ?? 0) > 0;
    const stars = r.stars_spent ?? 0;
    const kind = fortuneTypeFromTag(r.emotion_tag);
    if (kind) {
      const g =
        fortune.get(kind) ?? { kind, count: 0, paidCount: 0, starsSpent: 0 };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      fortune.set(kind, g);
    } else {
      const tag = r.emotion_tag ?? "(없음)";
      const key = `${r.consultation_type}|${tag}`;
      const g =
        counsel.get(key) ?? {
          emotionTag: tag,
          consultationType: r.consultation_type,
          count: 0,
          paidCount: 0,
          starsSpent: 0,
        };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      counsel.set(key, g);
    }
  }

  const packages = new Map<string, PackageGroup>();
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const key = p.package_type ?? "(없음)";
    const g =
      packages.get(key) ?? { packageType: key, count: 0, revenueWon: 0 };
    g.count += 1;
    g.revenueWon += p.amount_won ?? 0;
    packages.set(key, g);
  }

  const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;
  return {
    counsel: [...counsel.values()].sort(byCountDesc),
    fortune: [...fortune.values()].sort(byCountDesc),
    packages: [...packages.values()].sort((a, b) => b.revenueWon - a.revenueWon),
  };
}

export type TrendPoint = { date: string; newUsers: number; readings: number; revenueWon: number };

/** UTC ISO → KST 날짜(YYYY-MM-DD). */
function kstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildTrends(input: {
  users: { created_at: string }[];
  readings: { created_at: string }[];
  payments: { created_at: string; amount_won: number | null; status: string | null }[];
  days: number;
  todayKst: string; // 'YYYY-MM-DD' (KST 오늘)
}): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  // 날짜 축 미리 채움 (todayKst 부터 과거로 days 개)
  const base = new Date(`${input.todayKst}T00:00:00Z`);
  for (let i = 0; i < input.days; i++) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    map.set(d, { date: d, newUsers: 0, readings: 0, revenueWon: 0 });
  }
  const bump = (iso: string, f: (p: TrendPoint) => void) => {
    const p = map.get(kstDate(iso));
    if (p) f(p);
  };
  for (const u of input.users) bump(u.created_at, (p) => (p.newUsers += 1));
  for (const r of input.readings) bump(r.created_at, (p) => (p.readings += 1));
  for (const pay of input.payments) {
    if (pay.status !== "completed") continue;
    bump(pay.created_at, (p) => (p.revenueWon += pay.amount_won ?? 0));
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type FunnelRow = {
  creative: string; // utm_content · '(organic)'(utm 빈 캡처) · '(추적 안 됨)'(acquisition 없음)
  signups: number;
  tried: number;
  firstPaid: number;
  repaid: number;
  signupToPaidPct: number; // 0~100, 소수 1자리
  revenueWon: number;
  spendWon: number | null;
  cac: number | null;
  roas: number | null;
};

const ORGANIC = "(organic)";
const UNTRACKED = "(추적 안 됨)";

export function buildFunnel(input: {
  acquisitions: { user_id: string; utm_content: string | null }[];
  readings: { user_id: string }[];
  payments: { user_id: string; status: string | null; amount_won: number | null }[];
  spend: { creative_key: string; spend_won: number }[];
  /** 전체 window 유저(추적 안 된 유입 포함). 주면 acquisitions 에 없는 유저를 '(추적 안 됨)' 행으로. */
  allUserIds?: string[];
}): FunnelRow[] {
  const creativeOf = new Map<string, string>();
  const groups = new Map<string, { users: Set<string> }>();
  for (const a of input.acquisitions) {
    const c = a.utm_content || ORGANIC;
    creativeOf.set(a.user_id, c);
    (groups.get(c) ?? groups.set(c, { users: new Set() }).get(c)!).users.add(a.user_id);
  }
  // acquisition 레코드가 없는 유저 = 추적 안 됨 (utm 없이 공유링크·직접 유입)
  const tracked = new Set(input.acquisitions.map((a) => a.user_id));
  for (const uid of input.allUserIds ?? []) {
    if (tracked.has(uid)) continue;
    (groups.get(UNTRACKED) ?? groups.set(UNTRACKED, { users: new Set() }).get(UNTRACKED)!).users.add(uid);
  }

  const triedUsers = new Set(input.readings.map((r) => r.user_id));
  const paidCount = new Map<string, number>(); // completed 결제 수
  const revByUser = new Map<string, number>();
  for (const p of input.payments) {
    if (p.status !== "completed") continue;
    paidCount.set(p.user_id, (paidCount.get(p.user_id) ?? 0) + 1);
    revByUser.set(p.user_id, (revByUser.get(p.user_id) ?? 0) + (p.amount_won ?? 0));
  }

  const spendByCreative = new Map<string, number>();
  for (const s of input.spend) {
    spendByCreative.set(s.creative_key, (spendByCreative.get(s.creative_key) ?? 0) + s.spend_won);
  }

  const rows: FunnelRow[] = [];
  for (const [creative, g] of groups) {
    let tried = 0, firstPaid = 0, repaid = 0, revenueWon = 0;
    for (const u of g.users) {
      if (triedUsers.has(u)) tried += 1;
      const pc = paidCount.get(u) ?? 0;
      if (pc >= 1) firstPaid += 1;
      if (pc >= 2) repaid += 1;
      revenueWon += revByUser.get(u) ?? 0;
    }
    const signups = g.users.size;
    const spendWon = creative === ORGANIC ? null : spendByCreative.get(creative) ?? null;
    rows.push({
      creative,
      signups,
      tried,
      firstPaid,
      repaid,
      signupToPaidPct: signups ? Math.round((firstPaid / signups) * 1000) / 10 : 0,
      revenueWon,
      spendWon,
      cac: spendWon && signups ? Math.round(spendWon / signups) : null,
      roas: spendWon ? Math.round((revenueWon / spendWon) * 100) / 100 : null,
    });
  }
  // (organic) → (추적 안 됨) 순으로 맨 아래, 나머지는 가입 내림차순
  const rank = (c: string) => (c === UNTRACKED ? 2 : c === ORGANIC ? 1 : 0);
  return rows.sort((a, b) => {
    const d = rank(a.creative) - rank(b.creative);
    return d !== 0 ? d : b.signups - a.signups;
  });
}

export type CohortRow = {
  weekStart: string;             // 코호트 주차 시작(YYYY-MM-DD, KST 월요일)
  cohortSize: number;
  cumRevenuePerUser: number[];   // index = 경과 주차, 누적 결제액/코호트크기
  retention: { d1: number; d7: number; d30: number }; // 재활동 유저 비율 0~100
};

/** iso → KST 기준 그 주 월요일(YYYY-MM-DD). */
function kstWeekStart(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  const day = kst.getUTCDay(); // 0=일
  const diff = (day === 0 ? -6 : 1) - day; // 월요일로
  kst.setUTCDate(kst.getUTCDate() + diff);
  return kst.toISOString().slice(0, 10);
}
function daysBetween(aIso: string, bIso: string): number {
  return Math.floor((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000);
}

export function buildCohorts(input: {
  users: { id: string; created_at: string }[];
  payments: { user_id: string; amount_won: number | null; status: string | null; created_at: string }[];
  activity: { user_id: string; created_at: string }[]; // 재활동 신호(리딩 등)
  weeks: number;
}): CohortRow[] {
  const signup = new Map<string, string>(); // userId → created_at
  const cohortOf = new Map<string, string>(); // userId → weekStart
  const cohorts = new Map<string, Set<string>>();
  for (const u of input.users) {
    signup.set(u.id, u.created_at);
    const w = kstWeekStart(u.created_at);
    cohortOf.set(u.id, w);
    (cohorts.get(w) ?? cohorts.set(w, new Set()).get(w)!).add(u.id);
  }

  // 누적 결제(주차별)
  const rev = new Map<string, number[]>(); // weekStart → 주차별 결제 합
  for (const p of input.payments) {
    if (p.status !== "completed") continue;
    const su = signup.get(p.user_id);
    const w = cohortOf.get(p.user_id);
    if (!su || !w) continue;
    const wi = Math.max(0, Math.floor(daysBetween(su, p.created_at) / 7));
    if (wi >= input.weeks) continue;
    const arr = rev.get(w) ?? new Array(input.weeks).fill(0);
    arr[wi] += p.amount_won ?? 0;
    rev.set(w, arr);
  }

  // 리텐션(재활동 D1/D7/D30 — 가입 이후 해당 시점 이후 활동한 유저 수)
  const ret = new Map<string, { d1: Set<string>; d7: Set<string>; d30: Set<string> }>();
  for (const a of input.activity) {
    const su = signup.get(a.user_id);
    const w = cohortOf.get(a.user_id);
    if (!su || !w) continue;
    const d = daysBetween(su, a.created_at);
    const r = ret.get(w) ?? { d1: new Set(), d7: new Set(), d30: new Set() };
    if (d >= 1) r.d1.add(a.user_id);
    if (d >= 7) r.d7.add(a.user_id);
    if (d >= 30) r.d30.add(a.user_id);
    ret.set(w, r);
  }

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const out: CohortRow[] = [];
  for (const [weekStart, users] of cohorts) {
    const size = users.size;
    const revArr = rev.get(weekStart) ?? new Array(input.weeks).fill(0);
    // 누적화
    const cum: number[] = [];
    let running = 0;
    for (let i = 0; i < input.weeks; i++) {
      running += revArr[i];
      cum.push(size ? Math.round(running / size) : 0);
    }
    const r = ret.get(weekStart) ?? { d1: new Set(), d7: new Set(), d30: new Set() };
    out.push({
      weekStart,
      cohortSize: size,
      cumRevenuePerUser: cum,
      retention: { d1: pct(r.d1.size, size), d7: pct(r.d7.size, size), d30: pct(r.d30.size, size) },
    });
  }
  return out.sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // 최신 주차 먼저
}

// ── 별 소모 분류 엔진 (star_transactions → 종목·상품) ──────────────────────

export type StarTxRow = {
  user_id: string;
  type: string;
  amount: number;
  source: string;
  reading_id: string | null;
  created_at: string;
};

export type ReadingInfo = {
  consultation_type: "saju" | "tarot" | "relationship";
  emotion_tag: string | null;
  relationship_id: string | null;
  skill_key: string | null;
};

export type StarSpendDomain = "saju" | "tarot" | "fortune" | "relationship" | "upsell";
export type StarSpendGroup = {
  domain: StarSpendDomain;
  product: string;
  count: number;
  stars: number;
  users: number;
};

// 충전·보너스·환불·수동조정 = 상품 아님(별 소모 상품 분석에서 제외)
const NON_PRODUCT_SOURCES = new Set(["pg", "welcome_bonus", "first_charge_bonus", "admin_adjust"]);

/**
 * star_transactions 를 (종목, 상품)으로 분류. 분류 규칙:
 * reading_id 조인 우선(연애상담=relationship_id/skill_key → 운세=fortune tag → 대화상담) →
 * reading 없으면 source 파싱(fortune_* / rel_* / clarifier·extend) → 비상품(충전·보너스) 제외.
 */
export function buildStarSpendBreakdown(
  starTx: StarTxRow[],
  readingsById: Map<string, ReadingInfo>
): StarSpendGroup[] {
  const groups = new Map<
    string,
    { domain: StarSpendDomain; product: string; count: number; stars: number; users: Set<string> }
  >();
  const add = (domain: StarSpendDomain, product: string, tx: StarTxRow) => {
    const key = `${domain}|${product}`;
    const g = groups.get(key) ?? { domain, product, count: 0, stars: 0, users: new Set<string>() };
    g.count += 1;
    g.stars += tx.amount;
    g.users.add(tx.user_id);
    groups.set(key, g);
  };

  for (const tx of starTx) {
    if (tx.type !== "spend") continue;
    const src = tx.source;
    if (NON_PRODUCT_SOURCES.has(src) || src.startsWith("fortune_refund")) continue;

    // source 특수 케이스 우선(reading_id 유무 무관) — 업셀/패스/연장/판정은 source 가 권위.
    // (clarifier·extend 는 reading_id 가 있어도 종목 조인이 아니라 '업셀'로 별도 집계)
    if (src === "clarifier" || src === "extend") { add("upsell", src, tx); continue; }
    if (src === "relationship_pass") { add("relationship", "패스", tx); continue; }
    if (src === "rel_extend") { add("relationship", "스레드 연장", tx); continue; }
    if (src === "rel_skill_verdict") { add("relationship", "스킬:verdict", tx); continue; }

    // reading 조인(사주/타로 대화 · 연애상담 타로 스킬 · 운세 리포트)
    const r = tx.reading_id ? readingsById.get(tx.reading_id) : undefined;
    if (r) {
      if (r.relationship_id || r.skill_key) {
        add("relationship", r.skill_key ? `스킬:${r.skill_key}` : "스레드 대화", tx);
      } else {
        const ft = fortuneTypeFromTag(r.emotion_tag);
        if (ft) add("fortune", ft, tx);
        else if (r.consultation_type === "saju" || r.consultation_type === "tarot")
          add(r.consultation_type, r.emotion_tag ?? "(없음)", tx);
        else add("relationship", "스레드 대화", tx); // consultation_type='relationship' 인데 태그 없음
      }
      continue;
    }
    // reading 없음 → source 폴백
    if (src.startsWith("fortune_")) add("fortune", src.slice("fortune_".length), tx);
    else add("upsell", src, tx); // reading(레거시) 등 미상
  }

  return [...groups.values()]
    .map((g) => ({ domain: g.domain, product: g.product, count: g.count, stars: g.stars, users: g.users.size }))
    .sort((a, b) => b.stars - a.stars);
}
