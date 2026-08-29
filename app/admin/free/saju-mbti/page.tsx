// app/admin/free/saju-mbti/page.tsx — 사주 MBTI(무료 서비스) 종합 대시보드.
// 참여 → 결과분포 → 바이럴 → 가입 → 추세 → 구매 여정.
// MBTI 는 서버 기록 0 → page_views + ui_events(비-PII 결과코드 meta) 계측.
// 집계는 전부 RPC(admin_saju_mbti_*, admin_cohort_payments, admin_star_spend_breakdown).
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso, kstDate } from "@/lib/admin-time";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

export const dynamic = "force-dynamic";

// 구매 여정은 윈도우가 아니라 코호트 전 기간 LTV → 고정 하한.
const PURCHASE_FLOOR = "2026-01-01T00:00:00Z";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

const TREND_COLS: { kind: string; label: string }[] = [
  { kind: "visits", label: "방문UV" },
  { kind: "saju_mbti_started", label: "시작" },
  { kind: "saju_mbti_completed", label: "완료" },
  { kind: "saju_mbti_shared", label: "공유" },
  { kind: "saju_mbti_retry", label: "나도해보기" },
];

async function load() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(29);
  const p_fortune_types = Object.keys(FORTUNE_CONFIG);
  const today = kstDate(new Date().toISOString());

  const [sumRes, distRes, trendRes, cohortRes] = await Promise.all([
    supa.rpc("admin_saju_mbti_summary", { p_exclude }),
    supa.rpc("admin_saju_mbti_type_dist", { p_exclude }),
    supa.rpc("admin_saju_mbti_trend", { p_since, p_exclude }),
    supa.rpc("admin_saju_mbti_cohort_users", { p_exclude }),
  ]);

  const cohort = ((cohortRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id);

  const [payRes, spendRes] = await Promise.all([
    cohort.length
      ? supa.rpc("admin_cohort_payments", { p_users: cohort })
      : Promise.resolve({ data: [], error: null }),
    cohort.length
      ? supa.rpc("admin_star_spend_breakdown", {
          p_since: PURCHASE_FLOOR, p_until: null, p_exclude, p_fortune_types, p_users: cohort,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const su = ((sumRes.data ?? []) as {
    visits: number; started: number; birth: number; completed: number;
    shared: number; shared_view: number; retry: number; utm_signups: number;
  }[])[0];

  const distRows = (distRes.data ?? []) as { kind: string; key: string; cnt: number }[];
  const byKind = (k: string) =>
    distRows.filter((r) => r.kind === k).map((r) => ({ key: r.key, cnt: Number(r.cnt) }));

  const trendRows = (trendRes.data ?? []) as { bucket: string; kind: string; cnt: number }[];
  const byBucket: Record<string, Record<string, number>> = {};
  for (const r of trendRows) (byBucket[r.bucket] ??= {})[r.kind] = Number(r.cnt);
  const buckets = Object.keys(byBucket).sort().reverse();

  const pay = (payRes.data ?? []) as { package_type: string; payers: number; revenue_won: number; stars_given: number }[];
  const spend = (spendRes.data ?? []) as { domain: string; product: string; cnt: number; stars: number; free_stars: number; users: number }[];

  return {
    sumFailed: !!sumRes.error, distFailed: !!distRes.error, trendFailed: !!trendRes.error,
    cohortFailed: !!cohortRes.error, payFailed: !!payRes.error, spendFailed: !!spendRes.error,
    today, cohortN: cohort.length,
    su: {
      visits: Number(su?.visits ?? 0), started: Number(su?.started ?? 0),
      birth: Number(su?.birth ?? 0), completed: Number(su?.completed ?? 0),
      shared: Number(su?.shared ?? 0), sharedView: Number(su?.shared_view ?? 0),
      retry: Number(su?.retry ?? 0), utmSignups: Number(su?.utm_signups ?? 0),
    },
    palja: byKind("palja"), band: byKind("band"), element: byKind("element"),
    buckets, byBucket,
    pay: pay.map((p) => ({ ...p, payers: Number(p.payers), revenue_won: Number(p.revenue_won), stars_given: Number(p.stars_given) })),
    spend: spend.map((s) => ({ ...s, cnt: Number(s.cnt), stars: Number(s.stars), free_stars: Number(s.free_stars), users: Number(s.users) })),
  };
}

export default async function AdminSajuMbtiPage() {
  const s = await load();
  const su = s.su;
  const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);
  const completeRate = pct(su.completed, su.started);
  const shareRate = pct(su.shared, su.completed);
  const arriveConv = pct(su.retry, su.sharedView);
  const payers = s.pay.reduce((a, p) => a + p.payers, 0);
  const revenue = s.pay.reduce((a, p) => a + p.revenue_won, 0);
  const arpu = s.cohortN ? Math.round(revenue / s.cohortN) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">사주 MBTI <span className="text-white/40 text-sm">(무료 서비스)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">방문 → 완료 → 공유 → 가입 → 구매. 가입·구매·utm 지표는 배포 후 유입이 쌓여야 값이 남(미래분).</p>
      </div>

      <section>
        <h2 className="text-sm text-white/60 mb-3">① 참여</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="방문 UV" value={s.sumFailed ? "—" : su.visits} />
          <Stat label="시작" value={s.sumFailed ? "—" : su.started} />
          <Stat label="완료" value={s.sumFailed ? "—" : su.completed} sub={s.sumFailed ? undefined : `생일단계 ${su.birth}`} />
          <Stat label="완료율" value={s.sumFailed ? "—" : `${completeRate}%`} sub="완료/시작" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_saju_mbti_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">② 결과 분포</h2>
        {s.distFailed ? (
          <LoadFailed block="admin_saju_mbti_type_dist" />
        ) : (
          <div className="space-y-3">
            <div>
              <h3 className="text-[13px] text-white/50 mb-1">16유형 (팔자)</h3>
              <div className="text-[12px] text-white/40">
                {s.palja.length ? s.palja.map((r) => `${r.key} ${r.cnt}`).join(" · ") : "데이터 없음"}
              </div>
            </div>
            <div>
              <h3 className="text-[13px] text-white/50 mb-1">일치율 밴드</h3>
              <div className="text-[12px] text-white/40">
                {s.band.length ? s.band.map((r) => `${r.key} ${r.cnt}`).join(" · ") : "데이터 없음"}
              </div>
            </div>
            <div>
              <h3 className="text-[13px] text-white/50 mb-1">오행</h3>
              <div className="text-[12px] text-white/40">
                {s.element.length ? s.element.map((r) => `${r.key} ${r.cnt}`).join(" · ") : "데이터 없음"}
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">③ 바이럴</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="공유 발신" value={s.sumFailed ? "—" : su.shared} />
          <Stat label="공유율" value={s.sumFailed ? "—" : `${shareRate}%`} sub="공유/완료" />
          <Stat label="공유 도착" value={s.sumFailed ? "—" : su.sharedView} sub="친구 티저" />
          <Stat label="나도해보기" value={s.sumFailed ? "—" : su.retry} sub={s.sumFailed ? undefined : `도착전환 ${arriveConv}%`} />
        </div>
        {s.sumFailed && <LoadFailed block="admin_saju_mbti_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">④ 가입 <span className="text-white/35">(미래분)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="MBTI 경유 가입(utm)" value={s.sumFailed ? "—" : su.utmSignups} sub="순수 신규 획득" />
          <Stat label="코호트 규모" value={s.cohortFailed ? "—" : s.cohortN} sub="utm ∪ 완료·브리지" />
        </div>
        {s.cohortFailed && <LoadFailed block="admin_saju_mbti_cohort_users" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">⑤ 일별 추세 <span className="text-white/35">(최근 30일 · KST)</span></h2>
        {s.trendFailed ? (
          <LoadFailed block="admin_saju_mbti_trend" />
        ) : s.buckets.length === 0 ? (
          <div className="text-[12px] text-white/40">데이터 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-white/40 text-left">
                  <th className="py-1 pr-3">날짜</th>
                  {TREND_COLS.map((c) => (<th key={c.kind} className="py-1 px-2 text-right">{c.label}</th>))}
                </tr>
              </thead>
              <tbody>
                {s.buckets.map((b) => (
                  <tr key={b} className={`border-t border-white/5 ${b === s.today ? "text-gold" : "text-white/70"}`}>
                    <td className="py-1 pr-3">{b.slice(5)}{b === s.today ? " (오늘)" : ""}</td>
                    {TREND_COLS.map((c) => (
                      <td key={c.kind} className="py-1 px-2 text-right">{s.byBucket[b]?.[c.kind] ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">⑥ 구매 여정 <span className="text-white/35">(코호트 전 기간 · 미래분)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="별 충전 결제자" value={s.payFailed ? "—" : payers} sub={s.payFailed ? undefined : `코호트 ${s.cohortN}명 중`} />
          <Stat label="별 충전 매출(원)" value={s.payFailed ? "—" : revenue.toLocaleString()} />
          <Stat label="코호트 ARPU(원)" value={s.payFailed ? "—" : arpu.toLocaleString()} sub="매출/코호트" />
        </div>
        {s.payFailed && <LoadFailed block="admin_cohort_payments" className="mt-2" />}
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">별 패키지 분포</h3>
        <div className="text-[12px] text-white/40">
          {s.pay.length ? s.pay.map((p) => `${p.package_type} ${p.payers}명·${p.revenue_won.toLocaleString()}원`).join(" · ") : "데이터 없음"}
        </div>
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">운세/타로 상품 소비 (별 소모)</h3>
        {s.spendFailed ? (
          <LoadFailed block="admin_star_spend_breakdown" className="mt-2" />
        ) : s.spend.length === 0 ? (
          <div className="text-[12px] text-white/40">데이터 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-white/40 text-left">
                  <th className="py-1 pr-3">종목</th><th className="py-1 pr-3">상품</th>
                  <th className="py-1 px-2 text-right">건수</th><th className="py-1 px-2 text-right">별</th>
                  <th className="py-1 px-2 text-right">무료별</th><th className="py-1 px-2 text-right">이용자</th>
                </tr>
              </thead>
              <tbody>
                {s.spend.map((r, i) => (
                  <tr key={i} className="border-t border-white/5 text-white/70">
                    <td className="py-1 pr-3">{r.domain}</td><td className="py-1 pr-3">{r.product}</td>
                    <td className="py-1 px-2 text-right">{r.cnt}</td><td className="py-1 px-2 text-right">{r.stars}</td>
                    <td className="py-1 px-2 text-right">{r.free_stars}</td><td className="py-1 px-2 text-right">{r.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
