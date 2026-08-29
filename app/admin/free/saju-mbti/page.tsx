// app/admin/free/saju-mbti/page.tsx — 사주 MBTI(무료 서비스) 종합 대시보드.
// 참여 → 결과분포 → 바이럴 → 가입 → 추세 → 구매 여정.
// MBTI 는 서버 기록 0 → page_views + ui_events(비-PII 결과코드 meta) 계측.
// 집계는 전부 RPC(admin_saju_mbti_*, admin_cohort_payments, admin_star_spend_breakdown).
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray, ASSUMED_FREE_STAR_COST_WON } from "@/lib/admin";
import { daysAgoKstIso, kstDate } from "@/lib/admin-time";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { TYPE_CONTENT } from "@/lib/saju-mbti/content";

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

// 분포 막대 한 줄. code=4자 코드(또는 밴드/오행 라벨), meta=메타포(전래 캐릭터). value 0 이면 막대 없음.
function BarRow({ code, meta, value, max, color }: { code: string; meta?: string; value: number; max: number; color: string }) {
  const pct = max > 0 && value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-36 shrink-0 text-[12px] truncate">
        <span className="text-white/80">{code}</span>
        {meta && <span className="text-white/40"> {meta}</span>}
      </div>
      <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-7 shrink-0 text-right text-[12px] text-white/60 tabular-nums">{value}</div>
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

  const cohortRows = (cohortRes.data ?? []) as { user_id: string; is_new: boolean }[];
  const newIds = cohortRows.filter((r) => r.is_new).map((r) => r.user_id);
  const oldIds = cohortRows.filter((r) => !r.is_new).map((r) => r.user_id);
  const cohort = cohortRows.map((r) => r.user_id); // 전체(리텐션 표시용 코호트 규모 등 기존 용도 유지)

  const [payNewRes, payOldRes, spendNewRes, retRes, typeRes] = await Promise.all([
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
    supa.rpc("admin_saju_mbti_retention", { p_exclude }),
    supa.rpc("admin_saju_mbti_type_payment", { p_exclude }),
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

  const sumPay = (rows: unknown) => {
    const a = (rows ?? []) as { payers: number; revenue_won: number }[];
    return { payers: a.reduce((s, p) => s + Number(p.payers), 0), revenue: a.reduce((s, p) => s + Number(p.revenue_won), 0) };
  };
  const newPay = sumPay(payNewRes.data), oldPay = sumPay(payOldRes.data);
  const newFreeStars = ((spendNewRes.data ?? []) as { free_stars: number }[]).reduce((s, r) => s + Number(r.free_stars), 0);
  const spendNew = ((spendNewRes.data ?? []) as { domain: string; product: string; cnt: number; stars: number; free_stars: number; users: number }[]).map((r) => ({ ...r, cnt: Number(r.cnt), stars: Number(r.stars), free_stars: Number(r.free_stars), users: Number(r.users) }));
  const payNew = ((payNewRes.data ?? []) as { package_type: string; payers: number; revenue_won: number; stars_given: number }[]).map((p) => ({ ...p, payers: Number(p.payers), revenue_won: Number(p.revenue_won), stars_given: Number(p.stars_given) }));
  const retRows = (retRes.data ?? []) as { horizon: string; eligible: number; returned: number }[];
  const typeRows = (typeRes.data ?? []) as { dim: string; key: string; completers: number; payers: number }[];

  return {
    sumFailed: !!sumRes.error, distFailed: !!distRes.error, trendFailed: !!trendRes.error,
    cohortFailed: !!cohortRes.error,
    payFailed: !!payNewRes.error || !!payOldRes.error, spendFailed: !!spendNewRes.error,
    retFailed: !!retRes.error, typeFailed: !!typeRes.error,
    today, cohortN: cohort.length,
    su: {
      visits: Number(su?.visits ?? 0), started: Number(su?.started ?? 0),
      birth: Number(su?.birth ?? 0), completed: Number(su?.completed ?? 0),
      shared: Number(su?.shared ?? 0), sharedView: Number(su?.shared_view ?? 0),
      retry: Number(su?.retry ?? 0), utmSignups: Number(su?.utm_signups ?? 0),
    },
    palja: byKind("palja"), band: byKind("band"), element: byKind("element"),
    buckets, byBucket,
    newN: newIds.length, oldN: oldIds.length,
    newPay, oldPay, newFreeStars, spendNew, payNew,
    ret: Object.fromEntries(retRows.map((r) => [r.horizon, { eligible: Number(r.eligible), returned: Number(r.returned) }])) as Record<string, { eligible: number; returned: number }>,
    // 결과분포 ②의 `band`(밴드별 완료 건수, {key,cnt})와 이름이 겹쳐 bandPay 로 분리(payload=결제율 계산용 {key,completers,payers}).
    bandPay: typeRows.filter((r) => r.dim === "band").map((r) => ({ key: r.key, completers: Number(r.completers), payers: Number(r.payers) })),
    paljaPay: typeRows.filter((r) => r.dim === "palja").map((r) => ({ key: r.key, completers: Number(r.completers), payers: Number(r.payers) })),
  };
}

export default async function AdminSajuMbtiPage() {
  const s = await load();
  const su = s.su;
  const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);
  const completeRate = pct(su.completed, su.started);
  const shareRate = pct(su.shared, su.completed);
  const arriveConv = pct(su.retry, su.sharedView);
  // 결과 분포 차트: 16유형은 count 내림차순(RPC 정렬 유지), 밴드·오행은 의미 순서 고정.
  const paljaMax = Math.max(1, ...s.palja.map((r) => r.cnt));
  const bandMap: Record<string, number> = Object.fromEntries(s.band.map((r) => [r.key, r.cnt]));
  const elementMap: Record<string, number> = Object.fromEntries(s.element.map((r) => [r.key, r.cnt]));
  const bandMax = Math.max(1, ...Object.values(bandMap));
  const elementMax = Math.max(1, ...Object.values(elementMap));
  const BAND_ORDER = ["천명", "절충", "거스름"];
  const ELEMENT_ORDER = ["목", "화", "토", "금", "수"];

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
          <div className="space-y-5">
            <div>
              <h3 className="text-[13px] text-white/50 mb-2">16유형 <span className="text-white/30">· 4자 코드 + 캐릭터</span></h3>
              {s.palja.length ? (
                <div className="space-y-1.5">
                  {s.palja.map((r) => (
                    <BarRow key={r.key} code={r.key} meta={TYPE_CONTENT[r.key]?.character} value={r.cnt} max={paljaMax} color="bg-lilac-mid" />
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-white/40">데이터 없음</div>
              )}
            </div>
            <div>
              <h3 className="text-[13px] text-white/50 mb-2">일치율 밴드</h3>
              <div className="space-y-1.5">
                {BAND_ORDER.map((k) => (
                  <BarRow key={k} code={k} value={bandMap[k] ?? 0} max={bandMax} color="bg-gold-soft" />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[13px] text-white/50 mb-2">오행</h3>
              <div className="space-y-1.5">
                {ELEMENT_ORDER.map((k) => (
                  <BarRow key={k} code={k} value={elementMap[k] ?? 0} max={elementMax} color="bg-lilac-mid" />
                ))}
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
        <h2 className="text-sm text-white/60 mb-3">⑥ 구매 여정 <span className="text-white/35">(신규=공유·초대 획득 / 기존=이미 유저)</span></h2>
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
        <h3 className="text-[13px] text-white/50 mt-4 mb-2">완료→재방문 리텐션 <span className="text-white/30">(같은 기기 하한 · 성숙분모)</span></h3>
        {s.retFailed ? (
          <LoadFailed block="admin_saju_mbti_retention" />
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
        <h2 className="text-sm text-white/60 mb-3">⑦ 유형 × 결제 <span className="text-white/35">(로그인 완료자만 · 표본편향 · 밴드 우선)</span></h2>
        {s.typeFailed ? (
          <LoadFailed block="admin_saju_mbti_type_payment" />
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-[13px] text-white/50 mb-2">밴드별 결제율</h3>
              {s.bandPay.length ? ["천명", "절충", "거스름"].map((k) => {
                const row = s.bandPay.find((b) => b.key === k) ?? { completers: 0, payers: 0 };
                const rate = row.completers ? Math.round((row.payers / row.completers) * 1000) / 10 : 0;
                return <BarRow key={k} code={k} value={rate} max={100} color="bg-gold-soft" />;
              }) : <div className="text-[12px] text-white/40">데이터 없음</div>}
            </div>
            <div>
              <h3 className="text-[13px] text-white/50 mb-2">팔자 유형별 결제율 <span className="text-white/30">(참고, 소표본)</span></h3>
              {s.paljaPay.length ? (
                <div className="space-y-1.5">
                  {s.paljaPay.map((r) => {
                    const rate = r.completers ? Math.round((r.payers / r.completers) * 1000) / 10 : 0;
                    return <BarRow key={r.key} code={r.key} meta={TYPE_CONTENT[r.key]?.character} value={rate} max={100} color="bg-lilac-mid" />;
                  })}
                </div>
              ) : <div className="text-[12px] text-white/40">데이터 없음</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
