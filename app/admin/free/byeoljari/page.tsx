// app/admin/free/byeoljari/page.tsx — 별 인연 별자리(무료 서비스) 퍼널 대시보드.
// 생성 → 초대 → 가입 → 결제. 어트리뷰션 = 링크 utm(user_acquisition) + 참여자 anon 브리지(page_views).
// 집계는 전부 RPC(admin_byeoljari_*) — 원본 행을 앱으로 끌어오지 않는다(패턴 B, admin/relationship 관행).
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray, ASSUMED_FREE_STAR_COST_WON } from "@/lib/admin";
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

function fmtDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}시간`;
  return `${Math.round((hours / 24) * 10) / 10}일`;
}

// 일별 표에 그릴 kind 순서·라벨(단일 원천).
const TREND_COLS: { kind: string; label: string; won?: boolean }[] = [
  { kind: "maps_created", label: "생성" },
  { kind: "entry_uv", label: "만들기UV" },
  { kind: "landing_uv", label: "조회UV" },
  { kind: "member_joins", label: "참여" },
  { kind: "invite_clicks", label: "초대클릭" },
  { kind: "signups_utm", label: "utm가입" },
  { kind: "cohort_payments", label: "결제" },
  { kind: "cohort_revenue", label: "매출(원)", won: true },
];

async function load() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(29); // 최근 30일(오늘 포함)
  const today = kstDate(new Date().toISOString());

  const [sumRes, trendRes, distRes, utmRes, convRes] = await Promise.all([
    supa.rpc("admin_byeoljari_summary", { p_exclude }),
    supa.rpc("admin_byeoljari_trend", { p_since, p_exclude }),
    supa.rpc("admin_byeoljari_member_dist", { p_exclude }),
    supa.rpc("admin_byeoljari_creator_utm", { p_exclude }),
    supa.rpc("admin_byeoljari_conversion", { p_exclude }),
  ]);

  const sumFailed = !!sumRes.error;
  const trendFailed = !!trendRes.error;
  const distFailed = !!distRes.error;
  const utmFailed = !!utmRes.error;
  const convFailed = !!convRes.error;

  const su = (
    (sumRes.data ?? []) as {
      total_maps: number; maps_login: number; maps_anon: number;
      entry_uv: number; landing_uv: number;
      total_members: number; name_public_members: number; invite_clicks: number;
      signups_utm: number; member_signups: number; cohort_size: number;
      cohort_payers: number; cohort_revenue: number;
      total_users: number; total_payers: number;
    }[]
  )[0];

  const trendRows = (trendRes.data ?? []) as { bucket: string; kind: string; cnt: number }[];
  const byBucket: Record<string, Record<string, number>> = {};
  for (const r of trendRows) (byBucket[r.bucket] ??= {})[r.kind] = Number(r.cnt);
  const buckets = Object.keys(byBucket).sort().reverse(); // 최신 날짜 위로

  const di = (
    (distRes.data ?? []) as {
      avg_members: number; p50: number; p75: number; p90: number; max_members: number;
      maps_0: number; maps_1: number; maps_2_3: number; maps_4_6: number;
      maps_7_10: number; maps_11plus: number;
    }[]
  )[0];

  const creatorUtm = (utmRes.data ?? []) as { utm_source: string; cnt: number }[];
  const conv = (
    (convRes.data ?? []) as { create_to_pay_median_hours: number | null; sample_n: number }[]
  )[0];

  const cohortRes = await supa.rpc("admin_byeoljari_cohort_users", { p_exclude });
  const cohortRows = (cohortRes.data ?? []) as { user_id: string; is_new: boolean }[];
  const newIds = cohortRows.filter((r) => r.is_new).map((r) => r.user_id);
  const oldIds = cohortRows.filter((r) => !r.is_new).map((r) => r.user_id);
  const p_fortune_types = Object.keys(FORTUNE_CONFIG);

  const [payNewRes, payOldRes, spendNewRes, retRes] = await Promise.all([
    newIds.length
      ? supa.rpc("admin_cohort_payments", { p_users: newIds })
      : Promise.resolve({ data: [], error: null }),
    oldIds.length
      ? supa.rpc("admin_cohort_payments", { p_users: oldIds })
      : Promise.resolve({ data: [], error: null }),
    newIds.length
      ? supa.rpc("admin_star_spend_breakdown", {
          p_since: PURCHASE_FLOOR, p_until: null, p_exclude, p_fortune_types, p_users: newIds,
        })
      : Promise.resolve({ data: [], error: null }),
    supa.rpc("admin_byeoljari_retention", { p_exclude }),
  ]);

  const sumPay = (rows: unknown) => {
    const a = (rows ?? []) as { payers: number; revenue_won: number }[];
    return { payers: a.reduce((s, p) => s + Number(p.payers), 0), revenue: a.reduce((s, p) => s + Number(p.revenue_won), 0) };
  };
  const newPay = sumPay(payNewRes.data), oldPay = sumPay(payOldRes.data);
  const newFreeStars = ((spendNewRes.data ?? []) as { free_stars: number }[]).reduce((s, r) => s + Number(r.free_stars), 0);
  const spendNew = ((spendNewRes.data ?? []) as { domain: string; product: string; cnt: number; stars: number; free_stars: number; users: number }[]).map((r) => ({ ...r, cnt: Number(r.cnt), stars: Number(r.stars), free_stars: Number(r.free_stars), users: Number(r.users) }));
  const payNew = ((payNewRes.data ?? []) as { package_type: string; payers: number; revenue_won: number; stars_given: number }[]).map((p) => ({ ...p, payers: Number(p.payers), revenue_won: Number(p.revenue_won), stars_given: Number(p.stars_given) }));
  const retRows = (retRes.data ?? []) as { horizon: string; eligible: number; returned: number }[];

  return {
    sumFailed, trendFailed, distFailed, utmFailed, convFailed, today,
    cohortFailed: !!cohortRes.error,
    payFailed: !!payNewRes.error || !!payOldRes.error, spendFailed: !!spendNewRes.error,
    retFailed: !!retRes.error,
    newN: newIds.length, oldN: oldIds.length,
    newPay, oldPay, newFreeStars, spendNew, payNew,
    ret: Object.fromEntries(retRows.map((r) => [r.horizon, { eligible: Number(r.eligible), returned: Number(r.returned) }])) as Record<string, { eligible: number; returned: number }>,
    su: {
      totalMaps: Number(su?.total_maps ?? 0),
      mapsLogin: Number(su?.maps_login ?? 0),
      mapsAnon: Number(su?.maps_anon ?? 0),
      entryUv: Number(su?.entry_uv ?? 0),
      landingUv: Number(su?.landing_uv ?? 0),
      totalMembers: Number(su?.total_members ?? 0),
      namePublicMembers: Number(su?.name_public_members ?? 0),
      inviteClicks: Number(su?.invite_clicks ?? 0),
      signupsUtm: Number(su?.signups_utm ?? 0),
      memberSignups: Number(su?.member_signups ?? 0),
      cohortSize: Number(su?.cohort_size ?? 0),
      cohortPayers: Number(su?.cohort_payers ?? 0),
      cohortRevenue: Number(su?.cohort_revenue ?? 0),
      totalUsers: Number(su?.total_users ?? 0),
      totalPayers: Number(su?.total_payers ?? 0),
    },
    dist: {
      avg: Number(di?.avg_members ?? 0),
      p50: Number(di?.p50 ?? 0),
      p75: Number(di?.p75 ?? 0),
      p90: Number(di?.p90 ?? 0),
      max: Number(di?.max_members ?? 0),
      hist: [
        { label: "0명", v: Number(di?.maps_0 ?? 0) },
        { label: "1명", v: Number(di?.maps_1 ?? 0) },
        { label: "2–3명", v: Number(di?.maps_2_3 ?? 0) },
        { label: "4–6명", v: Number(di?.maps_4_6 ?? 0) },
        { label: "7–10명", v: Number(di?.maps_7_10 ?? 0) },
        { label: "11명+", v: Number(di?.maps_11plus ?? 0) },
      ],
    },
    creatorUtm: creatorUtm.map((u) => ({ source: u.utm_source, cnt: Number(u.cnt) })),
    conv: {
      medianHours: conv?.create_to_pay_median_hours == null ? null : Number(conv.create_to_pay_median_hours),
      sampleN: Number(conv?.sample_n ?? 0),
    },
    buckets,
    byBucket,
  };
}

export default async function AdminByeoljariPage() {
  const s = await load();
  const su = s.su;
  const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);
  const entryToCreate = pct(su.totalMaps, su.entryUv);
  const optInRate = pct(su.namePublicMembers, su.totalMembers);
  const cohortPayRate = pct(su.cohortPayers, su.cohortSize);
  const totalPayRate = pct(su.totalPayers, su.totalUsers);
  const kFactor = su.totalMaps ? Math.round((su.signupsUtm / su.totalMaps) * 100) / 100 : 0;
  const cohortArpu = su.cohortSize ? Math.round(su.cohortRevenue / su.cohortSize) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">별 인연 별자리 <span className="text-white/40 text-sm">(무료 서비스)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">생성 → 초대 → 가입 → 결제 퍼널. 미래분 지표(utm·K-factor)는 배포 후 유입이 쌓여야 값이 남.</p>
      </div>

      <section>
        <h2 className="text-sm text-white/60 mb-3">① 생성</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="총 별자리" value={s.sumFailed ? "—" : su.totalMaps} sub={s.sumFailed ? undefined : `로그인 ${su.mapsLogin} · 익명 ${su.mapsAnon}`} />
          <Stat label="만들기 진입 UV" value={s.sumFailed ? "—" : su.entryUv} />
          <Stat label="진입→생성 전환" value={s.sumFailed ? "—" : `${entryToCreate}%`} />
          <Stat label="별자리 경유 가입(utm)" value={s.sumFailed ? "—" : su.signupsUtm} sub="미래분" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">생성자 UTM 분포</h3>
        {s.utmFailed ? (
          <LoadFailed block="admin_byeoljari_creator_utm" />
        ) : s.creatorUtm.length === 0 ? (
          <div className="text-[12px] text-white/40">데이터 없음</div>
        ) : (
          <div className="text-[12px] text-white/40">
            {s.creatorUtm.map((u) => `${u.source} ${u.cnt}`).join(" · ")}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">② 초대 / 바이럴</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="랜딩 조회 UV" value={s.sumFailed ? "—" : su.landingUv} />
          <Stat label="총 참여(멤버)" value={s.sumFailed ? "—" : su.totalMembers} />
          <Stat label="이름공개 옵트인율" value={s.sumFailed ? "—" : `${optInRate}%`} sub={s.sumFailed ? undefined : `${su.namePublicMembers}/${su.totalMembers}`} />
          <Stat label="초대클릭(발신)" value={s.sumFailed ? "—" : su.inviteClicks} />
          <Stat label="K-factor" value={s.sumFailed ? "—" : kFactor} sub="맵당 utm 가입 · 미래분" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">지도당 멤버 수 분포</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="평균" value={s.distFailed ? "—" : s.dist.avg} />
          <Stat label="중앙(P50)" value={s.distFailed ? "—" : s.dist.p50} />
          <Stat label="상위25%(P75)" value={s.distFailed ? "—" : s.dist.p75} />
          <Stat label="상위10%(P90)" value={s.distFailed ? "—" : s.dist.p90} />
          <Stat label="최대" value={s.distFailed ? "—" : s.dist.max} />
        </div>
        {s.distFailed ? (
          <LoadFailed block="admin_byeoljari_member_dist" className="mt-2" />
        ) : (
          <div className="mt-2 text-[12px] text-white/40">
            {s.dist.hist.map((h) => `${h.label} ${h.v}`).join(" · ")}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">③ 가입 <span className="text-white/35">(참여자 브리지는 같은 기기 로그인만 = 하한)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="참여자→가입" value={s.sumFailed ? "—" : su.memberSignups} sub="member_anon 브리지" />
          <Stat label="별자리 경유 가입(utm)" value={s.sumFailed ? "—" : su.signupsUtm} sub="미래분" />
          <Stat label="코호트 규모" value={s.sumFailed ? "—" : su.cohortSize} sub="utm ∪ 참여자" />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">④ 결제 → 구매 여정</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="코호트 결제자" value={s.sumFailed ? "—" : su.cohortPayers} sub={s.sumFailed ? undefined : `${su.cohortSize}명 중`} />
          <Stat label="코호트 결제율" value={s.sumFailed ? "—" : `${cohortPayRate}%`} sub={s.sumFailed ? undefined : `전체 ${totalPayRate}%`} />
          <Stat label="코호트 매출(원)" value={s.sumFailed ? "—" : su.cohortRevenue.toLocaleString()} />
          <Stat label="코호트 ARPU(원)" value={s.sumFailed ? "—" : cohortArpu.toLocaleString()} sub="매출/코호트" />
          <Stat
            label="생성→첫결제 중앙"
            value={s.convFailed || s.conv.medianHours == null ? "—" : fmtDuration(s.conv.medianHours)}
            sub={s.convFailed || !s.conv.sampleN ? undefined : `표본 ${s.conv.sampleN}명`}
          />
        </div>
        {s.sumFailed && <LoadFailed block="admin_byeoljari_summary" className="mt-2" />}
        {s.convFailed && <LoadFailed block="admin_byeoljari_conversion" className="mt-2" />}

        <h3 className="text-[13px] text-white/50 mt-6 mb-2">신규/기존 분해 <span className="text-white/30">(신규=공유·초대 획득 / 기존=이미 유저)</span></h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="신규 결제자" value={s.payFailed ? "—" : s.newPay.payers} sub={s.payFailed ? undefined : `신규 ${s.newN}명 중`} />
          <Stat label="신규 매출(원)" value={s.payFailed ? "—" : s.newPay.revenue.toLocaleString()} />
          <Stat label="기존 결제자" value={s.payFailed ? "—" : s.oldPay.payers} sub={s.payFailed ? undefined : `기존 ${s.oldN}명 중`} />
          <Stat label="기존 매출(원)" value={s.payFailed ? "—" : s.oldPay.revenue.toLocaleString()} />
        </div>
        {s.payFailed && <LoadFailed block="admin_cohort_payments" className="mt-2" />}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <Stat label="신규 무료별 소모" value={s.spendFailed ? "—" : s.newFreeStars} sub="개" />
          <Stat label="신규 순 기여마진(원)" value={s.spendFailed || s.payFailed ? "—" : (s.newPay.revenue - s.newFreeStars * ASSUMED_FREE_STAR_COST_WON).toLocaleString()} sub={`매출−무료별×₩${ASSUMED_FREE_STAR_COST_WON} 가정`} />
        </div>
        {s.spendFailed && <LoadFailed block="admin_star_spend_breakdown" className="mt-2" />}

        <h3 className="text-[13px] text-white/50 mt-4 mb-2">생성→재방문 리텐션 <span className="text-white/30">(같은 기기 하한 · 성숙분모)</span></h3>
        {s.retFailed ? (
          <LoadFailed block="admin_byeoljari_retention" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {["d1", "d7", "d30"].map((h) => {
              const r = s.ret[h] ?? { eligible: 0, returned: 0 };
              const pctv = r.eligible ? Math.round((r.returned / r.eligible) * 1000) / 10 : 0;
              return <Stat key={h} label={h.toUpperCase()} value={`${pctv}%`} sub={`${r.returned}/${r.eligible}`} />;
            })}
          </div>
        )}

        <h3 className="text-[13px] text-white/50 mt-4 mb-2">별 패키지 분포 <span className="text-white/30">(신규 코호트)</span></h3>
        <div className="text-[12px] text-white/40">
          {s.payNew.length ? s.payNew.map((p) => `${p.package_type} ${p.payers}명·${p.revenue_won.toLocaleString()}원`).join(" · ") : "데이터 없음"}
        </div>
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">운세/타로 상품 소비 <span className="text-white/30">(신규 코호트 · 별 소모)</span></h3>
        {s.spendFailed ? (
          <LoadFailed block="admin_star_spend_breakdown" className="mt-2" />
        ) : s.spendNew.length === 0 ? (
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
                {s.spendNew.map((r, i) => (
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

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 추세 <span className="text-white/35">(최근 30일 · KST)</span></h2>
        {s.trendFailed ? (
          <LoadFailed block="admin_byeoljari_trend" />
        ) : s.buckets.length === 0 ? (
          <div className="text-[12px] text-white/40">데이터 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-white/40 text-left">
                  <th className="py-1 pr-3">날짜</th>
                  {TREND_COLS.map((c) => (
                    <th key={c.kind} className="py-1 px-2 text-right">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.buckets.map((b) => (
                  <tr key={b} className={`border-t border-white/5 ${b === s.today ? "text-gold" : "text-white/70"}`}>
                    <td className="py-1 pr-3">{b.slice(5)}{b === s.today ? " (오늘)" : ""}</td>
                    {TREND_COLS.map((c) => {
                      const v = s.byBucket[b]?.[c.kind] ?? 0;
                      return (
                        <td key={c.kind} className="py-1 px-2 text-right">
                          {c.won ? v.toLocaleString() : v}
                        </td>
                      );
                    })}
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
