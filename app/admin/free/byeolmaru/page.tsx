// app/admin/free/byeolmaru/page.tsx — 별마루(3탭 리텐션 허브) 계측 대시보드.
// 진입(PV/UV) · 인터랙션(날짜 셀 클릭·우리 사이 슬롯 클릭) · 퍼널 이탈(사주 프로필 없음·비로그인)
// · D1~D7 재방문. 데이터는 /api/admin/byeolmaru(requireAdmin 가드) 에서 온다.
// 플랜: docs/superpowers/plans/2026-09-04-별마루-4-계측.md Task 3
import { headers } from "next/headers";
import LoadFailed from "@/components/admin/LoadFailed";
import { kstDate } from "@/lib/admin-time";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="text-[12px] text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

// 일별 표에 그릴 kind 순서·라벨(단일 원천). no_profile/need_login 은 trend RPC 에 없다
// (누적 요약에서만 잡는다 — 하루 단위로 쪼개기엔 너무 드문 이탈이라 추세로서 의미가 약하다).
const TREND_COLS: { kind: string; label: string }[] = [
  { kind: "pv", label: "PV" },
  { kind: "uv", label: "UV" },
  { kind: "day_selected", label: "날짜클릭" },
  { kind: "slot_clicked", label: "슬롯클릭" },
];

const RETENTION_OFFSETS = [1, 2, 3, 4, 5, 6, 7];

type SummaryRow = {
  pv: number; uv: number;
  day_selected_events: number; day_selected_actors: number;
  slot_clicked_events: number; slot_clicked_actors: number;
  no_profile_events: number; no_profile_actors: number;
  need_login_events: number; need_login_actors: number;
};
type TrendRow = { bucket: string; kind: string; cnt: number };
type RetentionRow = { cohort_date: string; cohort_users: number; offset_day: number; returned_users: number };

// 어드민 페이지가 자신의 /api/admin/* 라우트를 서버사이드에서 셀프 호출한다
// (app/admin/traffic·analytics 와 동일 관행). 쿠키를 그대로 넘겨 라우트 쪽 requireAdmin 이
// 같은 세션으로 재검증한다 — 페이지(레이아웃 가드)와 라우트(개별 가드)의 이중 보호.
async function load() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";

  let summary: SummaryRow | null = null;
  let summaryError = true;
  let trend: TrendRow[] = [];
  let trendError = true;
  let retention: RetentionRow[] = [];
  let retentionError = true;

  try {
    const res = await fetch(`${proto}://${host}/api/admin/byeolmaru`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json();
      summary = (json.summary ?? null) as SummaryRow | null;
      summaryError = !!json.summaryError;
      trend = (json.trend ?? []) as TrendRow[];
      trendError = !!json.trendError;
      retention = (json.retention ?? []) as RetentionRow[];
      retentionError = !!json.retentionError;
    }
  } catch {
    // 네트워크/파싱 실패 — 위에서 초기화한 실패 기본값(전부 error=true)을 그대로 쓴다.
  }

  const su = summary;
  const sum = {
    pv: Number(su?.pv ?? 0),
    uv: Number(su?.uv ?? 0),
    daySelectedEvents: Number(su?.day_selected_events ?? 0),
    daySelectedActors: Number(su?.day_selected_actors ?? 0),
    slotClickedEvents: Number(su?.slot_clicked_events ?? 0),
    slotClickedActors: Number(su?.slot_clicked_actors ?? 0),
    noProfileEvents: Number(su?.no_profile_events ?? 0),
    noProfileActors: Number(su?.no_profile_actors ?? 0),
    needLoginEvents: Number(su?.need_login_events ?? 0),
    needLoginActors: Number(su?.need_login_actors ?? 0),
  };

  // 추세는 long format(행=날짜×kind) → 날짜별로 피벗해야 표를 그릴 수 있다.
  const byBucket: Record<string, Record<string, number>> = {};
  for (const r of trend) (byBucket[r.bucket] ??= {})[r.kind] = Number(r.cnt);
  const buckets = Object.keys(byBucket).sort().reverse(); // 최신 날짜 위로

  // 재방문도 long format(행=코호트×offset) → 코호트별로 묶는다. 특정 offset 이 그 코호트의
  // 행 목록에 없으면 "재방문 0"이 아니라 "그 (코호트, D일) 조합이 아직 오늘을 안 지났다"는
  // 뜻이다(RPC 의 미성숙 가드가 행 자체를 뺐다) — has(d) 로 반드시 구분해서 렌더할 것.
  const byCohort = new Map<string, { users: number; byOffset: Map<number, number> }>();
  for (const r of retention) {
    const entry = byCohort.get(r.cohort_date) ?? { users: Number(r.cohort_users), byOffset: new Map<number, number>() };
    entry.byOffset.set(Number(r.offset_day), Number(r.returned_users));
    byCohort.set(r.cohort_date, entry);
  }
  const cohorts = [...byCohort.entries()]
    .map(([cohortDate, v]) => ({ cohortDate, ...v }))
    .sort((a, b) => (a.cohortDate < b.cohortDate ? 1 : -1)); // 최신 코호트 위로

  return {
    summaryError, trendError, retentionError,
    today: kstDate(new Date().toISOString()),
    sum, byBucket, buckets, cohorts,
  };
}

export default async function AdminByeolmaruPage() {
  const s = await load();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">별마루 <span className="text-white/40 text-sm">(리텐션 허브)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">
          진입(PV/UV) · 날짜 셀 클릭 · 우리 사이 슬롯 클릭 · 퍼널 이탈(사주 프로필 없음·비로그인) · D1~D7 재방문.
          트래픽이 흐르기 전 기준선 계측 — 배포 직후엔 값이 작다.
        </p>
      </div>

      <section>
        <h2 className="text-sm text-white/60 mb-3">① 진입 · 인터랙션</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="진입 PV" value={s.summaryError ? "—" : s.sum.pv} />
          <Stat label="진입 UV" value={s.summaryError ? "—" : s.sum.uv} />
          <Stat
            label="날짜 셀 클릭"
            value={s.summaryError ? "—" : s.sum.daySelectedEvents}
            sub={s.summaryError ? undefined : `${s.sum.daySelectedActors}명`}
          />
          <Stat
            label="슬롯 클릭"
            value={s.summaryError ? "—" : s.sum.slotClickedEvents}
            sub={s.summaryError ? undefined : `${s.sum.slotClickedActors}명 · →/relationship`}
          />
        </div>
        {s.summaryError && <LoadFailed block="admin_byeolmaru_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ② 퍼널 이탈 <span className="text-white/35">(진입은 했지만 캘린더를 못 본 경우)</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="사주 프로필 없음"
            value={s.summaryError ? "—" : s.sum.noProfileEvents}
            sub={s.summaryError ? undefined : `${s.sum.noProfileActors}명`}
          />
          <Stat
            label="비로그인"
            value={s.summaryError ? "—" : s.sum.needLoginEvents}
            sub={s.summaryError ? undefined : `${s.sum.needLoginActors}명`}
          />
        </div>
        {s.summaryError && <LoadFailed block="admin_byeolmaru_summary" className="mt-2" />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 추세 <span className="text-white/35">(최근 30일 · KST)</span></h2>
        {s.trendError ? (
          <LoadFailed block="admin_byeolmaru_trend" />
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
        <h2 className="text-sm text-white/60 mb-3">
          D1~D7 재방문 <span className="text-white/35">(로그인 유저 · 최초 방문일 코호트)</span>
        </h2>
        {s.retentionError ? (
          <LoadFailed block="admin_byeolmaru_retention" />
        ) : s.cohorts.length === 0 ? (
          // 🔴 빈 배열은 버그가 아니라 정상이다 — 코호트가 오늘 막 생겼으면 D1~D7 전부
          // "아직 오늘을 안 지나서" RPC 가 행 자체를 안 준다(미성숙 가드). 이걸 "0% 재방문"으로
          // 그리면 방금 생긴 제품을 죽은 것처럼 오독하게 만든다 — 그래서 빈 표 대신 이 문장.
          <div className="rounded-lg bg-white/5 p-4 text-[13px] text-white/60">
            아직 관측창이 안 찼습니다 — 별마루 첫 방문 코호트가 오늘이라 D1 재방문은 내일부터
            값이 쌓입니다. 빈 표는 재방문 0(이탈)이 아니라 <b className="text-white/80">시간이
            아직 안 지났다</b>는 뜻입니다.
          </div>
        ) : (
          <>
            <p className="text-[11px] text-white/35 mb-2">
              퍼센트와 실인원을 함께 표시합니다 — 코호트가 작을 때(분자 1~3명) 퍼센트만 보면
              오독하기 쉽습니다.{" "}
              <span className="text-white/25">— 관측 전</span>은 그 (코호트, D일) 조합이 아직
              오늘을 안 지나 재방문 여부를 판단할 수 없다는 뜻이며, 재방문 0과는 다릅니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-white/40 text-left">
                    <th className="py-1 pr-3">코호트(최초방문일)</th>
                    <th className="py-1 px-2 text-right">인원</th>
                    {RETENTION_OFFSETS.map((d) => (
                      <th key={d} className="py-1 px-2 text-right">D{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.cohorts.map((c) => (
                    <tr key={c.cohortDate} className="border-t border-white/5 text-white/70">
                      <td className="py-1 pr-3">{c.cohortDate}</td>
                      <td className="py-1 px-2 text-right">{c.users}</td>
                      {RETENTION_OFFSETS.map((d) => {
                        const has = c.byOffset.has(d);
                        const returned = c.byOffset.get(d) ?? 0;
                        const pct = c.users ? Math.round((returned / c.users) * 1000) / 10 : 0;
                        return (
                          <td key={d} className="py-1 px-2 text-right">
                            {has ? `${pct}% (${returned}/${c.users})` : <span className="text-white/25">— 관측 전</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
