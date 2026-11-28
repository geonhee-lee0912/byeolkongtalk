// lib/admin/platform.ts — 앱/웹 구분·그 기간 실제 결제자 RPC 행 → 화면 줄. 순수 함수.
// RPC: admin_platform_daily · admin_platform_summary · admin_period_payers
// (supabase/migrations/20261128000000_admin_platform_split.sql). 정의는 그 파일 머리말이 정본.

export type PlatformCounts = {
  uvApp: number; uvWeb: number; pvApp: number; pvWeb: number;
  signupsApp: number; signupsWeb: number; signupsUnknown: number;
  payToss: number; payApple: number; payGoogle: number;
  wonToss: number; wonApple: number; wonGoogle: number;
};

const COLUMNS: [keyof PlatformCounts, string][] = [
  ["uvApp", "uv_app"], ["uvWeb", "uv_web"], ["pvApp", "pv_app"], ["pvWeb", "pv_web"],
  ["signupsApp", "signups_app"], ["signupsWeb", "signups_web"], ["signupsUnknown", "signups_unknown"],
  ["payToss", "pay_toss"], ["payApple", "pay_apple"], ["payGoogle", "pay_google"],
  ["wonToss", "won_toss"], ["wonApple", "won_apple"], ["wonGoogle", "won_google"],
];

/** RPC 한 행(snake_case, BIGINT 는 문자열일 수 있다) → 숫자. 행이 없거나 칸이 비면 0. */
export function platformCounts(row: Record<string, unknown> | undefined): PlatformCounts {
  const out = {} as PlatformCounts;
  for (const [key, col] of COLUMNS) out[key] = Number(row?.[col] ?? 0) || 0;
  return out;
}

/** 날짜별 행을 주어진 날짜 축 순서로 — 활동이 없어 RPC 가 행을 안 준 날은 0. */
export function platformDailyRows(
  rows: Record<string, unknown>[],
  dates: string[],
): ({ date: string } & PlatformCounts)[] {
  const byDate = new Map(rows.map((r) => [String(r.d), r]));
  return dates.map((date) => ({ date, ...platformCounts(byDate.get(date)) }));
}

export type PeriodPayerLine = { segment: string; label: string; people: number | null; payments: number; won: number };

/** 화면 순서 = 이 순서. 라벨 조회는 Map(동적 키로 객체를 조회하면 "constructor" 같은 키에 걸린다). */
export const PAYER_SEGMENTS: [string, string][] = [
  ["new_48h", "신규 · 가입 48시간 안 첫 결제"],
  ["new_later", "신규 · 48시간 뒤 첫 결제"],
  ["existing_first", "기존 가입자 · 첫 결제"],
  ["repeat", "재결제"],
  ["withdrawn", "탈퇴(사람 구분 불가)"],
];

/** 분류 행 → 늘 5줄(고정 순서, 없는 분류 0) + 합계. 탈퇴 줄의 사람은 null 이고 사람 합계에서 뺀다. */
export function periodPayerLines(rows: Record<string, unknown>[]): {
  rows: PeriodPayerLine[];
  total: { people: number; payments: number; won: number };
} {
  const bySeg = new Map(rows.map((r) => [String(r.segment), r]));
  const lines = PAYER_SEGMENTS.map(([segment, label]) => {
    const r = bySeg.get(segment);
    const withdrawn = segment === "withdrawn";
    return {
      segment, label,
      people: withdrawn ? null : Number(r?.people ?? 0) || 0,
      payments: Number(r?.payments ?? 0) || 0,
      won: Number(r?.won ?? 0) || 0,
    };
  });
  const total = lines.reduce(
    (a, l) => ({ people: a.people + (l.people ?? 0), payments: a.payments + l.payments, won: a.won + l.won }),
    { people: 0, payments: 0, won: 0 },
  );
  return { rows: lines, total };
}

/** 트래픽 API 용 — 이 RPC 실패는 앱/웹 표만 실패로 둔다(화면의 다른 지표까지 끌고 가지 않는다). */
export function platformDailyResult(
  res: { data: unknown; error: unknown },
  dates: string[],
): { rows: ({ date: string } & PlatformCounts)[]; failed: boolean } {
  if (res.error) return { rows: [], failed: true };
  return { rows: platformDailyRows((res.data ?? []) as Record<string, unknown>[], dates), failed: false };
}

/** "그 기간 실제 결제자" 날짜 표시 — 결제율 성숙 7일과 같은 오늘-8 ~ 오늘-2 (KST 날짜 YYYY-MM-DD 입력). */
export function payersWindowLabel(todayKst: string): string {
  const shift = (days: number) => {
    const d = new Date(`${todayKst}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(5, 10);
  };
  return `${shift(8)} ~ ${shift(2)}`;
}
