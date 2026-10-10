// lib/ads/meta-insights.ts — Meta Insights(광고 단위·일별) → ad_spend 행.
//
// 설계: docs/superpowers/specs/2026-10-10-광고비-API-자동수집-design.md
// 이 파일의 변환 함수는 순수하다(DB·env 무관) — 계약은 meta-insights.test.ts.
// 🔴 Insights 요청 URL 에는 access_token 이 들어간다. URL 을 로그·에러에 절대 넣지 말 것.

export const GRAPH_VERSION = "v23.0";

export interface InsightRow {
  date_start: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
}

export interface AdSpendRow {
  spend_date: string;
  campaign: string;
  adset: string;
  creative_key: string;
  impressions: number | null;
  clicks: number | null;
  spend_won: number;
  reach: number | null;
  note: "api" | "api:no_delivery";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcMidnight(d: string): number {
  if (!DATE_RE.test(d)) throw new Error(`bad date: ${d}`);
  return Date.parse(`${d}T00:00:00Z`);
}

/** from~to (양 끝 포함) YYYY-MM-DD 목록. */
export function datesInRange(from: string, to: string): string[] {
  const start = utcMidnight(from);
  const end = utcMidnight(to);
  if (start > end) throw new Error(`bad range: ${from} > ${to}`);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** 지금의 KST 날짜. 광고 계정 TZ 가 Asia/Seoul 이라 Insights 의 date_start 와 같은 축이다. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return new Date(utcMidnight(d) + n * DAY_MS).toISOString().slice(0, 10);
}

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

/**
 * Insights 행 → ad_spend 행.
 * - 같은 (날짜·캠페인·세트·광고) 키는 합산 (UNIQUE 위반 방지). 지출 반올림은 합산 뒤 한 번.
 * - dates 중 응답이 없는 날은 0원 행 1개(note='api:no_delivery') — "행 0개 = 미입력" 판정 보존.
 * - dates 밖 날짜가 섞이면 throw — 교체 범위 밖을 쓰지 않는다.
 */
export function toAdSpendRows(insights: InsightRow[], dates: string[]): AdSpendRow[] {
  const inRange = new Set(dates);
  const byKey = new Map<string, AdSpendRow & { rawSpend: number }>();

  for (const x of insights) {
    if (!inRange.has(x.date_start)) {
      throw new Error(`insight date ${x.date_start} outside requested range`);
    }
    const r = {
      spend_date: x.date_start,
      campaign: (x.campaign_name ?? "").trim(),
      adset: (x.adset_name ?? "").trim(),
      creative_key: (x.ad_name ?? "").trim(),
      impressions: num(x.impressions),
      clicks: num(x.inline_link_clicks),
      spend_won: 0,
      reach: num(x.reach),
      note: "api" as const,
      rawSpend: num(x.spend) ?? 0,
    };
    const key = [r.spend_date, r.campaign, r.adset, r.creative_key].join("\u0000");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
    } else {
      prev.rawSpend += r.rawSpend;
      prev.impressions = addNullable(prev.impressions, r.impressions);
      prev.clicks = addNullable(prev.clicks, r.clicks);
      prev.reach = addNullable(prev.reach, r.reach);
    }
  }

  const out: AdSpendRow[] = [];
  for (const { rawSpend, ...r } of byKey.values()) {
    out.push({ ...r, spend_won: Math.round(rawSpend) });
  }

  const delivered = new Set(out.map((r) => r.spend_date));
  for (const d of dates) {
    if (!delivered.has(d)) {
      out.push({
        spend_date: d, campaign: "", adset: "", creative_key: "",
        impressions: 0, clicks: 0, spend_won: 0, reach: 0, note: "api:no_delivery",
      });
    }
  }

  return out.sort((a, b) =>
    a.spend_date.localeCompare(b.spend_date) ||
    a.campaign.localeCompare(b.campaign) ||
    a.adset.localeCompare(b.adset) ||
    a.creative_key.localeCompare(b.creative_key));
}
