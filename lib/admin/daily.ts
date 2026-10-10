// lib/admin/daily.ts — 대시보드 "매일 보기" 블록의 순수 계산.
// 설계: docs/superpowers/specs/2026-10-10-대시보드-매일보기-재구성-design.md
// DB·env 무관 — 조회는 lib/admin/daily-load.ts. 계약은 daily.test.ts.
import { addDays } from "@/lib/ads/meta-insights";

// 별 사용 소스 → 화면 라벨. 맵에 없는 값은 원문 그대로 — 동적 키로 config 를 조회해
// undefined 를 렌더하다 크래시 나는 클래스(메모리 recurring-crash-class-config-by-dynamic-key)를 피한다.
const SPEND_SOURCE_LABEL: Record<string, string> = {
  tarot_reading: "타로",
  saju_reading: "사주 상담",
  clarifier: "추가 질문",
  extend: "연장",
  relationship_pass: "연애 패스",
  rel_extend: "연애 연장",
  relationship_sim_suggest: "연애 시뮬 제안",
  byeolmaru_subscription: "별마루 구독",
  admin_adjust: "어드민 조정",
};

export function spendSourceLabel(source: string | null): string {
  if (!source) return "(출처 없음)";
  if (Object.prototype.hasOwnProperty.call(SPEND_SOURCE_LABEL, source)) return SPEND_SOURCE_LABEL[source];
  if (source.startsWith("fortune_")) return "사주 리포트";
  if (source.startsWith("rel_skill_")) return "연애 스킬";
  return source;
}

/** "타로 130 · 추가 질문 10" — 들어온 순서 그대로. 메뉴판 55·130 은 소스가 같아 금액으로 구분된다. */
export function summarizeSpends(spends: { source: string | null; amount: number }[]): string {
  return spends.map((s) => `${spendSourceLabel(s.source)} ${Math.abs(s.amount)}`).join(" · ");
}

export interface PayRateDay { d: string; signups: number; payers: number; p1: number; p2: number }
export interface PayRateLine { signups: number; payers: number; p1: number; p2: number; maturing: boolean }

function sumDays(rows: PayRateDay[], maturing: boolean): PayRateLine {
  return rows.reduce<PayRateLine>(
    (a, r) => ({ signups: a.signups + r.signups, payers: a.payers + r.payers, p1: a.p1 + r.p1, p2: a.p2 + r.p2, maturing }),
    { signups: 0, payers: 0, p1: 0, p2: 0, maturing },
  );
}

/**
 * 결제율 3줄. 결제는 가입 후 48시간 안만 센다(admin_pay_rate) → 오늘·어제 코호트는 아직 진행 중이다.
 * 7일 줄은 **성숙한 7일**(오늘-8 ~ 오늘-2)만 합산한다 — 진행 중 코호트를 섞으면 율이 낮게 보인다.
 */
export function payRateLines(rows: PayRateDay[], todayKst: string) {
  const yesterday = addDays(todayKst, -1);
  const from = addDays(todayKst, -8);
  const to = addDays(todayKst, -2);
  return {
    today: sumDays(rows.filter((r) => r.d === todayKst), true),
    yesterday: sumDays(rows.filter((r) => r.d === yesterday), true),
    mature7: sumDays(rows.filter((r) => r.d >= from && r.d <= to), false),
  };
}

/** 소표본이라 율만 쓰지 않는다 — "3명 (7.5%)". 분모 0 은 —. */
export function countPct(n: number, den: number): string {
  if (den <= 0) return "—";
  return `${n}명 (${((n / den) * 100).toFixed(1)}%)`;
}

const STALE_MS = 2 * 60 * 60 * 1000; // 매시 cron 이라 2시간 = 연속 2회 누락

/**
 * 광고비 동기화 신호. 없으면 null.
 * - 최신 실행이 실패(ok=false) → 실패
 * - 마지막 성공이 없거나 2시간 이상 전 → 멈춤
 * 최신 실행이 진행 중(ok=null)이면 마지막 성공 기준으로만 본다.
 */
export function adSyncAlert(
  latest: { ok: boolean | null; error: string | null } | null,
  lastOkFinishedAt: string | null,
  now: Date,
): string | null {
  if (latest?.ok === false) return `광고비 동기화 실패 — ${latest.error ?? "원인 미기록"}`;
  if (!lastOkFinishedAt) return "광고비 동기화 성공 기록 없음";
  const age = now.getTime() - Date.parse(lastOkFinishedAt);
  if (age >= STALE_MS) return `광고비 동기화가 ${Math.floor(age / 3_600_000)}시간째 멈춤`;
  return null;
}

/** ad_spend 행 → 소재(별칭 병합)별 지출·클릭 합. 빈 creative_key 는 건너뛴다(no_delivery 0행). */
export function sumSpendClicksByCreative(
  rows: { creative_key: string; clicks: number | null; spend_won: number | null }[],
  canon: (k: string) => string,
): Map<string, { spend: number; clicks: number }> {
  const m = new Map<string, { spend: number; clicks: number }>();
  for (const r of rows) {
    if (!r.creative_key) continue;
    const k = canon(r.creative_key);
    const cur = m.get(k) ?? { spend: 0, clicks: 0 };
    m.set(k, { spend: cur.spend + Number(r.spend_won ?? 0), clicks: cur.clicks + Number(r.clicks ?? 0) });
  }
  return m;
}

const NON_AD_UNTRACKED = "(추적 안 됨)";
const NON_AD_ORGANIC = "(organic)";

/**
 * 소재 표를 "지금 게재 중인 광고"로 좁힌다. activeNames 가 null(미기록)이면 필터 없이 비광고 행만 뺀다.
 * 게재 목록의 이름도 같은 canon 으로 병합해 비교한다(행의 creative 는 이미 canon 된 값).
 */
export function filterActiveCreatives<T extends { creative: string }>(
  rows: T[],
  activeNames: string[] | null,
  canon: (k: string) => string,
): { rows: T[]; filtered: boolean } {
  const ads = rows.filter((r) => r.creative !== NON_AD_UNTRACKED && r.creative !== NON_AD_ORGANIC);
  if (activeNames == null) return { rows: ads, filtered: false };
  const set = new Set(activeNames.map(canon));
  return { rows: ads.filter((r) => set.has(r.creative)), filtered: true };
}

/** 비광고 두 행의 가입 수. */
export function nonAdSignups(rows: { creative: string; signups: number }[]): { untracked: number; organic: number } {
  const of = (k: string) => rows.filter((r) => r.creative === k).reduce((a, r) => a + r.signups, 0);
  return { untracked: of(NON_AD_UNTRACKED), organic: of(NON_AD_ORGANIC) };
}

/**
 * KST "오전 11:05" / withDate 면 "10/10 오후 7:05".
 * Intl 의 hour12 에 맡기지 않는다 — 서버(Node) ICU 가 ko-KR 에서도 "AM"을 내는 걸 실측했다(2026-10-10).
 */
export function kstTimeLabel(iso: string, withDate = false): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const h = d.getUTCHours();
  const time = `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return withDate ? `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${time}` : time;
}

// 오프셋까지 붙은 타임스탬프만 받는다(PostgREST 는 "2026-10-09T15:00:20.623963+00:00" 형태로 준다).
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * [확인했어요] 의 until 검증. 통과하면 **받은 문자열 그대로** 돌려준다 — `new Date().toISOString()` 으로
 * 다시 쓰면 마이크로초가 밀리초로 잘려 기준선이 그 응답보다 앞서고, 가장 최신 응답이 영원히
 * "새 설문"으로 남는다(2026-10-10 prod 실측: 기준 .623 vs 응답 .623963).
 */
export function parseSeenUntil(v: unknown, now: Date): string | null {
  if (typeof v !== "string" || !TS_RE.test(v)) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t > now.getTime() + 60_000) return null;
  return v;
}
