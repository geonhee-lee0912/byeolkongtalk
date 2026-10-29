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
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) throw new Error(`bad date: ${d}`);
  return t;
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
    out.push({
      ...r,
      impressions: r.impressions == null ? null : Math.round(r.impressions),
      clicks: r.clicks == null ? null : Math.round(r.clicks),
      reach: r.reach == null ? null : Math.round(r.reach),
      spend_won: Math.round(rawSpend),
    });
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

const FIELDS = [
  "date_start", "campaign_name", "adset_name", "ad_name",
  "spend", "impressions", "reach", "inline_link_clicks",
].join(",");

const MAX_PAGES = 50;

/**
 * Meta 가 "잠깐 뒤 다시"라고 하는 오류 — code 1(unknown)·2(Service temporarily unavailable) 또는 is_transient.
 * 10-25·10-29 prod 에서 code 2 가 떠 그 시각 동기화가 통째로 실패했다(둘 다 다음 시각엔 정상).
 * 토큰 만료(190)·권한·파라미터 오류는 다시 불러도 같으니 재시도하지 않는다.
 */
function isTransientMetaError(err: { code?: number; is_transient?: boolean } | undefined): boolean {
  return err?.is_transient === true || err?.code === 1 || err?.code === 2;
}

/**
 * 일시 오류(위)·네트워크 실패·시간 초과가 재시도까지 다 실패한 것. 매시 cron 의 다음 회차가 같은 창을 다시
 * 읽어 메우므로(30일 467회 중 2회, 둘 다 복구) sync 는 이걸 error 가 아니라 warn 으로 남긴다.
 */
export class MetaTransientError extends Error {
  readonly transient = true;
}

const RETRY_DELAYS_MS = [2_000, 5_000];
/**
 * 요청 하나의 상한. 10-29 prod 실측: 실패 2회가 둘 다 정확히 30초 뒤 code 2(정상은 2초) = Meta 쪽 시간 초과.
 * 상한 없이 그런 시도 3번이면 97초 → cron maxDuration 을 넘겨 Vercel 이 함수를 죽이고 ad_sync_runs·error_logs 에
 * 아무것도 안 남는다. 20초 × 3 + 2 + 5 = 67초 — cron 의 maxDuration(120초) 안에 든다.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * act_{accountId}/insights 를 level=ad · 일별로 끝까지 읽는다.
 * 🔴 에러 메시지에 URL(=토큰 포함)을 넣지 않는다 — Meta 가 준 message·code 만.
 */
export async function fetchInsights(opts: {
  from: string;
  to: string;
  token: string;
  accountId: string;
  fetchImpl?: typeof fetch;
  /** 일시 오류·네트워크 실패·시간 초과 재시도 간격 (길이 = 재시도 횟수). 테스트는 [0, 0]. */
  retryDelaysMs?: number[];
  /** 요청 하나의 상한(ms). 넘기면 끊고 재시도. */
  requestTimeoutMs?: number;
}): Promise<InsightRow[]> {
  const f = opts.fetchImpl ?? fetch;
  const retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const timeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const params = new URLSearchParams({
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since: opts.from, until: opts.to }),
    fields: FIELDS,
    limit: "500",
    access_token: opts.token,
  });
  let url: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/act_${opts.accountId}/insights?${params}`;
  const out: InsightRow[] = [];
  for (let page = 0, attempt = 0; url; page++) {
    if (page >= MAX_PAGES) throw new Error(`Meta insights: ${MAX_PAGES}페이지 초과`);
    let res: Response;
    try {
      res = await f(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      // 네트워크 실패·시간 초과(TimeoutError)도 잠깐 뒤 다시. 원본 에러 메시지에 URL(토큰 포함)이 있을 수 있어 name 만 남긴다.
      if (attempt < retryDelays.length) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt++]));
        page--;
        continue;
      }
      throw new MetaTransientError(`Meta insights 네트워크 실패: ${(e as Error).name}`);
    }
    let j: {
      data?: InsightRow[];
      paging?: { next?: string };
      error?: { message?: string; code?: number; is_transient?: boolean };
    };
    try {
      j = await res.json();
    } catch {
      throw new Error(`Meta insights 실패 (HTTP ${res.status}): JSON 아님`);
    }
    if ((!res.ok || j.error) && isTransientMetaError(j.error)) {
      if (attempt < retryDelays.length) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt++]));
        page--; // 같은 페이지를 다시 — MAX_PAGES 를 재시도로 소모하지 않는다
        continue;
      }
      throw new MetaTransientError(`Meta insights 실패 (HTTP ${res.status}, code ${j.error?.code ?? "?"}): ${j.error?.message ?? "응답 없음"}`);
    }
    if (!res.ok || j.error) {
      throw new Error(`Meta insights 실패 (HTTP ${res.status}, code ${j.error?.code ?? "?"}): ${j.error?.message ?? "응답 없음"}`);
    }
    if (!Array.isArray(j.data)) throw new Error(`Meta insights 실패 (HTTP ${res.status}): data 없음`);
    out.push(...j.data);
    url = j.paging?.next ?? null;
  }
  return out;
}

/**
 * act_{accountId}/ads 중 effective_status=ACTIVE 인 광고 이름(trim·중복 제거).
 * 🔴 fetchInsights 와 같은 이유로 에러에 URL(토큰 포함)을 넣지 않는다.
 */
export async function fetchActiveAdNames(opts: {
  token: string;
  accountId: string;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const f = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    fields: "name,effective_status",
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
    limit: "500",
    access_token: opts.token,
  });
  let url: string | null = `https://graph.facebook.com/${GRAPH_VERSION}/act_${opts.accountId}/ads?${params}`;
  const names = new Set<string>();
  for (let page = 0; url; page++) {
    if (page >= MAX_PAGES) throw new Error(`Meta ads: ${MAX_PAGES}페이지 초과`);
    let res: Response;
    try {
      // 지출 동기화 뒤에 도는 부가 조회 — 매달리면 cron 시간 예산을 같이 먹으니 같은 상한
      res = await f(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      throw new Error(`Meta ads 네트워크 실패: ${(e as Error).name}`);
    }
    let j: {
      data?: { name?: string }[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };
    try {
      j = await res.json();
    } catch {
      throw new Error(`Meta ads 실패 (HTTP ${res.status}): JSON 아님`);
    }
    if (!res.ok || j.error) {
      throw new Error(`Meta ads 실패 (HTTP ${res.status}, code ${j.error?.code ?? "?"}): ${j.error?.message ?? "응답 없음"}`);
    }
    if (!Array.isArray(j.data)) throw new Error(`Meta ads 실패 (HTTP ${res.status}): data 없음`);
    for (const a of j.data) {
      const n = (a.name ?? "").trim();
      if (n) names.add(n);
    }
    url = j.paging?.next ?? null;
  }
  return [...names];
}
