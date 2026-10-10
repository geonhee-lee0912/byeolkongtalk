// lib/admin/daily-load.ts — 대시보드 "매일 보기" 블록의 조회 전부.
// 🔴 조회 실패를 0/빈 배열로 위장하지 않는다 — 블록별 failed 를 들고 올라간다.
// 목록(설문·결제)은 행수가 하루 몇 건이라 상한 + 경고로 직접 조회한다. 집계는 RPC.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionArray } from "@/lib/admin";
import { startOfTodayKstIso, daysAgoKstIso } from "@/lib/admin-time";
import { addDays, kstToday } from "@/lib/ads/meta-insights";
import { CREATIVE_ALIASES, canonicalCreative } from "@/lib/analytics/creative-alias";
import { adSyncAlert, filterActiveCreatives, nonAdSignups, payRateLines, sumSpendClicksByCreative, summarizeSpends, type PayRateDay } from "./daily";

// 접힌 블록이라 미확인을 거의 다 보여준다(하루 ~1건). 넘치면 가장 오래된 것부터 이만큼 — 아래 주석.
export const SURVEY_SHOW = 30;
export const PAYMENTS_LIMIT = 50;
const FUNNEL_LIMIT = 50;
const CLICK_ROWS_LIMIT = 2000;

export interface InboxSurvey { id: number; created_at: string; nickname: string | null; answers: unknown }
export interface TodayPayment {
  id: string; created_at: string; user_id: string | null; nickname: string | null;
  package_type: string | null; stars_given: number | null; amount_won: number;
  repeat: boolean; spends: string;
}
export interface CreativeRow {
  creative: string; spend_won: number; clicks: number; signups: number; first_paid: number;
  revenue_won: number; cac: number | null; roas: number | null;
}

export async function loadDaily() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const excluded = new Set(p_exclude);
  const today = startOfTodayKstIso();
  const todayKst = kstToday();
  const win7 = daysAgoKstIso(6); // 오늘 포함 7일 — 1층 다른 블록과 같은 창

  // ── 1차 병렬: 마커 · 오늘 결제 · 결제율 · 구독 · 소재 · 클릭 · 동기화 ──
  const [markerRes, payRes, rateRes, subTodayRes, sub7Res, funnelRes, clickRes, syncLatestRes, syncOkRes] =
    await Promise.all([
      supa.from("admin_seen_markers").select("seen_until").eq("key", "survey").maybeSingle(),
      supa.from("payments")
        .select("id, user_id, amount_won, stars_given, package_type, created_at")
        .eq("status", "completed").gte("created_at", today)
        .order("created_at", { ascending: false }).limit(PAYMENTS_LIMIT),
      supa.rpc("admin_pay_rate", { p_since: daysAgoKstIso(8), p_exclude }),
      supa.rpc("admin_layer2_subscription", { p_since: today, p_until: null, p_exclude }),
      supa.rpc("admin_layer2_subscription", { p_since: win7, p_until: null, p_exclude }),
      supa.rpc("admin_funnel", { p_since: win7, p_exclude, p_aliases: CREATIVE_ALIASES, p_limit: FUNNEL_LIMIT }),
      supa.from("ad_spend").select("creative_key, clicks, spend_won")
        .eq("platform", "meta").gte("spend_date", addDays(todayKst, -6)) // spend_date 는 이미 KST 날짜
        .limit(CLICK_ROWS_LIMIT),
      supa.from("ad_sync_runs").select("ok, error").order("started_at", { ascending: false }).limit(1),
      supa.from("ad_sync_runs").select("finished_at, active_creatives").eq("ok", true).order("finished_at", { ascending: false }).limit(1),
    ]);

  // ── 새 설문 (마커 이후 · 마커 없으면 최근 7일) ──
  const seenUntil: string | null = markerRes.data?.seen_until ?? null;
  const surveySince = seenUntil ?? daysAgoKstIso(6);
  const [svCountRes, svListRes] = await Promise.all([
    supa.from("survey_responses").select("id", { count: "exact", head: true }).gt("created_at", surveySince),
    supa.from("survey_responses").select("id, user_id, answers, created_at")
      .gt("created_at", surveySince).order("created_at", { ascending: true }).limit(SURVEY_SHOW), // 가장 오래된 미확인부터 — until 을 보인 것의 최신으로 두면 안 보인 것이 확인 처리되지 않는다
  ]);
  
  // ── 오늘 결제: 어드민 제외 → 재결제 여부 · 오늘 별 사용 ──
  const payments = ((payRes.data ?? []) as Omit<TodayPayment, "nickname" | "repeat" | "spends">[])
    .filter((p) => !p.user_id || !excluded.has(p.user_id));
  const payUserIds = [...new Set(payments.map((p) => p.user_id).filter((v): v is string => !!v))];
  const svUserIds = ((svListRes.data ?? []) as { user_id: string | null }[]).map((r) => r.user_id).filter((v): v is string => !!v);
  const nameIds = [...new Set([...payUserIds, ...svUserIds])];

  const [namesRes, priorRes, spendRes] = await Promise.all([
    nameIds.length ? supa.from("users").select("id, nickname").in("id", nameIds) : Promise.resolve({ data: [], error: null }),
    payUserIds.length
      ? supa.from("payments").select("user_id").eq("status", "completed").lt("created_at", today).in("user_id", payUserIds).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    payUserIds.length
      ? supa.from("star_transactions").select("user_id, source, amount, created_at").eq("type", "spend")
          .gte("created_at", today).in("user_id", payUserIds).order("created_at", { ascending: true }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const nameById = new Map(((namesRes.data ?? []) as { id: string; nickname: string | null }[]).map((u) => [u.id, u.nickname]));
  const priorPayers = new Set(((priorRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const spendsByUser = new Map<string, { source: string | null; amount: number }[]>();
  for (const s of (spendRes.data ?? []) as { user_id: string; source: string | null; amount: number }[]) {
    spendsByUser.set(s.user_id, [...(spendsByUser.get(s.user_id) ?? []), s]);
  }
  // 같은 유저가 오늘 두 번 결제하면 두 번째는 재결제다 — 오늘 안의 순서도 본다.
  const seenToday = new Set<string>();
  const todayPayments: TodayPayment[] = [...payments].reverse().map((p) => {
    const repeat = !!p.user_id && (priorPayers.has(p.user_id) || seenToday.has(p.user_id));
    if (p.user_id) seenToday.add(p.user_id);
    return {
      ...p, amount_won: Number(p.amount_won),
      nickname: p.user_id ? nameById.get(p.user_id) ?? null : null,
      repeat,
      spends: p.user_id ? summarizeSpends(spendsByUser.get(p.user_id) ?? []) : "",
    };
  }).reverse();
  const surveyFailed = Boolean(svCountRes.error || svListRes.error || markerRes.error || namesRes.error);
  const paymentsFailed = Boolean(payRes.error || priorRes.error || spendRes.error || namesRes.error);

  // ── 결제율 ──
  const rateRows: PayRateDay[] = ((rateRes.data ?? []) as Record<string, string>[]).map((r) => ({
    d: String(r.d), signups: Number(r.signups), payers: Number(r.payers), p1: Number(r.p1), p2: Number(r.p2),
  }));

  // ── 구독 ──
  type SubRow = { started: string; expired: string; active_now: string };
  const subOf = (res: { data: unknown }) => {
    const r = ((res.data ?? []) as SubRow[])[0];
    return { started: Number(r?.started ?? 0), expired: Number(r?.expired ?? 0), activeNow: Number(r?.active_now ?? 0) };
  };

  // ── 소재 표 ──
  // 지출·클릭은 ad_spend 에서 별칭 병합해 합산하고, 가입·결제·매출만 funnel 에서 가져온다.
  // funnel 은 가입이 있는 소재만 나오므로 지출만 있고 가입 0 인 소재가 빠지지 않게 합집합으로 만든다.
  const adAgg = sumSpendClicksByCreative(
    ((clickRes.data ?? []) as { creative_key: string; clicks: number | null; spend_won: number | null }[]),
    (k) => canonicalCreative(k) ?? k,
  );
  const funnel = new Map(((funnelRes.data ?? []) as Record<string, string | null>[]).map((r) => [String(r.creative), r]));
  const keys = new Set<string>([...adAgg.keys(), ...[...funnel.keys()].filter((k) => k !== "")]);
  const creatives: CreativeRow[] = [...keys].map((creative) => {
    const ad = adAgg.get(creative) ?? { spend: 0, clicks: 0 };
    const f = funnel.get(creative);
    const signups = Number(f?.signups ?? 0);
    const revenue = Number(f?.revenue_won ?? 0);
    return {
      creative, spend_won: ad.spend, clicks: ad.clicks, signups, first_paid: Number(f?.first_paid ?? 0),
      revenue_won: revenue, cac: ad.spend > 0 && signups > 0 ? ad.spend / signups : null, roas: ad.spend > 0 ? revenue / ad.spend : null,
    };
  });
  creatives.sort((a, b) => b.spend_won - a.spend_won || b.signups - a.signups);
  const okRun = ((syncOkRes.data ?? []) as { finished_at: string | null; active_creatives: string[] | null }[])[0];
  const activeFilter = filterActiveCreatives(creatives, okRun?.active_creatives ?? null, (k) => canonicalCreative(k) ?? k);
  const nonAd = nonAdSignups(creatives);

  // ── 고장 신호 중 광고비 동기화 ──
  const syncFailed = Boolean(syncLatestRes.error || syncOkRes.error);
  const latest = ((syncLatestRes.data ?? []) as { ok: boolean | null; error: string | null }[])[0] ?? null;
  const lastOk = ((syncOkRes.data ?? []) as { finished_at: string | null }[])[0]?.finished_at ?? null;
  const syncAlert = syncFailed ? "광고비 동기화 상태 확인 실패" : adSyncAlert(latest, lastOk, new Date());

  return {
    survey: {
      failed: surveyFailed,
      seenUntil,
      count: svCountRes.count ?? 0,
      items: ((svListRes.data ?? []) as { id: number; user_id: string | null; answers: unknown; created_at: string }[])
        .map((r) => ({ id: r.id, created_at: r.created_at, answers: r.answers, nickname: r.user_id ? nameById.get(r.user_id) ?? null : null }))
        // 가져오기는 오래된 순(확인 범위가 틀리지 않게), 보여주기는 최신 순(사용자 요청 10-10).
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    },
    payments: {
      failed: paymentsFailed, items: todayPayments,
      truncated: (payRes.data ?? []).length >= PAYMENTS_LIMIT,
      totalWon: todayPayments.reduce((a, p) => a + p.amount_won, 0),
    },
    payRate: { failed: Boolean(rateRes.error), ...payRateLines(rateRows, todayKst) },
    subscription: {
      failed: Boolean(subTodayRes.error || sub7Res.error),
      today: subOf(subTodayRes), last7: subOf(sub7Res),
    },
    creatives: {
      failed: Boolean(funnelRes.error || clickRes.error), items: activeFilter.rows,
      activeKnown: activeFilter.filtered, untracked: nonAd.untracked, organic: nonAd.organic,
      truncated: (funnelRes.data ?? []).length >= FUNNEL_LIMIT || (clickRes.data ?? []).length >= CLICK_ROWS_LIMIT,
    },
    syncAlert,
  };
}
