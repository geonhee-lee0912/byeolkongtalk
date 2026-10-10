// lib/ads/sync.ts — 광고비 동기화 한 번 = 실행 기록 → Insights 조회 → 날짜 단위 교체 RPC.
// cron·어드민 버튼·기간 재수집 세 진입점이 이 함수 하나를 공유한다.
// 실패는 ad_sync_runs(ok=false) + error_logs 두 곳에 남는다 — 조용히 멈추면 1층 광고비 지연
// 경고(adSpendStaleDays)가 세 번째 안전망으로 다시 켜진다.
import { getServiceSupabase } from "@/lib/supabase";
import { logError, logWarn } from "@/lib/logger";
import { addDays, datesInRange, fetchInsights, kstToday, toAdSpendRows } from "./meta-insights";

export type SyncTrigger = "cron" | "manual" | "range";

/** 매번 다시 읽는 최근 일수. Meta 가 며칠 전 수치를 나중에 보정하므로 오늘 + 7일. */
export const RECENT_DAYS = 7;
/** 기간 재수집 상한 (7월 출시 ~ 수개월 여유). */
export const MAX_RANGE_DAYS = 400;

export function recentRange(now: Date = new Date()): { from: string; to: string } {
  const to = kstToday(now);
  return { from: addDays(to, -RECENT_DAYS), to };
}

export type SyncResult =
  | { ok: true; rows: number; days: number }
  | { ok: false; error: string };

export async function syncAdSpend(opts: {
  from: string;
  to: string;
  trigger: SyncTrigger;
  adminId: string | null;
}): Promise<SyncResult> {
  const supa = getServiceSupabase();
  const { data: run, error: runErr } = await supa
    .from("ad_sync_runs")
    .insert({ trigger: opts.trigger, date_from: opts.from, date_to: opts.to, created_by: opts.adminId })
    .select("id")
    .single();
  if (runErr) {
    await logWarn("ad_sync_runs insert 실패: " + runErr.message, { route: "ad-spend-sync", extra: { trigger: opts.trigger } });
  }
  const runId = (run as { id: number } | null)?.id ?? null;

  try {
    const token = process.env.META_ADS_ACCESS_TOKEN;
    const accountId = process.env.META_AD_ACCOUNT_ID;
    if (!token || !accountId) throw new Error("META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID 미설정");

    const dates = datesInRange(opts.from, opts.to);
    if (dates.length > MAX_RANGE_DAYS) throw new Error(`기간이 ${MAX_RANGE_DAYS}일을 넘는다 (${dates.length}일)`);

    const insights = await fetchInsights({ from: opts.from, to: opts.to, token, accountId });
    const rows = toAdSpendRows(insights, dates).map((r) => ({ ...r, created_by: opts.adminId }));

    const { data: written, error } = await supa.rpc("admin_ad_spend_replace_days", {
      p_dates: dates,
      p_rows: rows,
    });
    if (error) throw new Error(`replace_days 실패: ${error.message}`);

    const n = Number(written ?? 0);
    if (runId != null) {
      await supa.from("ad_sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: true, rows_written: n })
        .eq("id", runId);
    }
    return { ok: true, rows: n, days: dates.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (runId != null) {
      await supa.from("ad_sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: message.slice(0, 500) })
        .eq("id", runId);
    }
    await logError(e, { route: "ad-spend-sync", extra: { trigger: opts.trigger, from: opts.from, to: opts.to } });
    return { ok: false, error: message };
  }
}
