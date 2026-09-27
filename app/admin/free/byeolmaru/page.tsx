// app/admin/free/byeolmaru/page.tsx — 별마루(리텐션 허브) 계측 대시보드.
//
// 화면 순서 = 제품의 흐름이다: 진입 → 허브 열람 → 페이월 노출 → 체험·구독 → 산출물·원가 →
// 추세 → 재방문. 데이터는 /api/admin/byeolmaru(requireAdmin 가드) 에서 온다.
//
// 🔴 **2026-09-27 재구성.** 이 화면은 이미 없어진 설계를 재고 있었다 — 2026-09-24 에 우리 오늘의
//    상대가 한 명이 되고 슬롯 과금이 사라지면서 `partner_selected` · `watch_limit` ·
//    `watch_purchase` 가, 09-26 스트립 삭제로 `slot_clicked` 가 **발화처 0** 이 됐다(코드의
//    trackUiEvent 호출문 전수 확인). 그 4칸과 "상대 수 분포" 표(상대가 한 명이라 항상 1행)를
//    걷고, 그 자리에 **지금 실제로 찍히는** 것들을 넣었다: gate_shown(dev 241건 — 최다) ·
//    day_tab_changed(68) · free_item_clicked(23) · 체험·구독 퍼널 · 산출물·LLM 원가.
//    ⚠️ 죽은 **RPC 는 DB 에 남아 있다**(admin_byeolmaru_watch_summary·_watch_distribution) —
//       과거 데이터를 읽을 유일한 경로다. 화면에서만 걷었다. 되살리려면 라우트부터 보라.
//
// 플랜 원형: docs/superpowers/plans/2026-09-04-별마루-4-계측.md Task 3
import { headers } from "next/headers";
import LoadFailed from "@/components/admin/LoadFailed";
import { Stat } from "@/components/admin/Stat";
import { kstDate } from "@/lib/admin-time";
import { formatMetric } from "@/lib/admin/format";
import { pct1 } from "@/lib/admin/layer1";
import { pivotLong, type Cell } from "@/lib/admin/byeolmaru-pivot";

export const dynamic = "force-dynamic";

// ── 표시 정의(단일 원천) ─────────────────────────────────────────────
// 일별 추세에 그릴 kind 순서·라벨. RPC(admin_byeolmaru_trend)가 내는 kind 와 1:1이다.
// no_profile/need_login 은 여기 없다 — 하루 단위로 쪼개기엔 드문 이탈이라 추세로서 의미가 약하고,
// 누적 요약에서 잡는다.
const TREND_COLS: { kind: string; label: string }[] = [
  { kind: "pv", label: "PV" },
  { kind: "uv", label: "UV" },
  { kind: "day_selected", label: "날짜클릭" },
  { kind: "free_item", label: "무료목록" },
  { kind: "gate_shown", label: "페이월" },
  { kind: "trial", label: "체험" },
  { kind: "subscribe", label: "구독완료" },
];

const RETENTION_OFFSETS = [1, 2, 3, 4, 5, 6, 7];

// meta 값 → 한글 라벨. 🔴 매핑에 없는 값은 **원본 키를 그대로 보여준다**(빈칸·크래시 금지) —
// 별마루가 목록에 항목을 추가하면 여기보다 먼저 데이터에 나타난다.
const FREE_ITEM_LABELS: Record<string, string> = {
  saju_today: "오늘 사주",
  tarot: "오늘 타로",
  woori: "우리 오늘",
  mbti: "사주 MBTI",
  byeoljari: "별 인연 지도",
};
const DAY_TAB_LABELS: Record<string, string> = { saju: "사주", tarot: "타로", woori: "우리" };
const SLOT_LABELS: Record<string, string> = {
  saju_report: "사주 리포트",
  tarot_rich: "타로 풀이",
  woori_30d: "우리 오늘 30일",
};

const FUNNEL_STAGES: { stage: string; label: string }[] = [
  { stage: "gate_shown", label: "페이월 노출" },
  { stage: "trial_started", label: "체험 시작" },
  { stage: "subscribe_clicked", label: "구독 클릭" },
  { stage: "subscribe_completed", label: "구독 완료" },
];

// ── RPC 행 타입 (PostgREST 는 BIGINT·NUMERIC 을 문자열로 준다 → 전부 Number() 경유) ──
type SummaryRow = {
  pv: number; uv: number;
  day_selected_events: number; day_selected_actors: number;
  no_profile_events: number; no_profile_actors: number;
  need_login_events: number; need_login_actors: number;
};
type TrendRow = { bucket: string; kind: string; cnt: number };
type RetentionRow = { cohort_date: string; cohort_users: number; offset_day: number; returned_users: number };
type FunnelRow = { stage: string; slot: string; events: number; actors: number };
type EngagementRow = { kind: string; key: string; events: number; actors: number };
type OutputRow = { category: string; key: string; cnt: number; users: number; cost_won: string | null };

// 어드민 페이지가 자신의 /api/admin/* 라우트를 서버사이드에서 셀프 호출한다
// (app/admin/traffic·analytics 와 동일 관행). 쿠키를 그대로 넘겨 라우트 쪽 requireAdmin 이
// 같은 세션으로 재검증한다 — 페이지(레이아웃 가드)와 라우트(개별 가드)의 이중 보호.
async function load() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";

  let windowDays = 30;
  let summary: SummaryRow | null = null;
  let summaryError = true;
  let trend: TrendRow[] = [];
  let trendError = true;
  let retention: RetentionRow[] = [];
  let retentionError = true;
  let funnel: FunnelRow[] = [];
  let funnelError = true;
  let engagement: EngagementRow[] = [];
  let engagementError = true;
  let output: OutputRow[] = [];
  let outputError = true;

  try {
    const res = await fetch(`${proto}://${host}/api/admin/byeolmaru`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json();
      windowDays = Number(json.windowDays ?? 30);
      summary = (json.summary ?? null) as SummaryRow | null;
      summaryError = !!json.summaryError;
      trend = (json.trend ?? []) as TrendRow[];
      trendError = !!json.trendError;
      retention = (json.retention ?? []) as RetentionRow[];
      retentionError = !!json.retentionError;
      funnel = (json.funnel ?? []) as FunnelRow[];
      funnelError = !!json.funnelError;
      engagement = (json.engagement ?? []) as EngagementRow[];
      engagementError = !!json.engagementError;
      output = (json.output ?? []) as OutputRow[];
      outputError = !!json.outputError;
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
    noProfileEvents: Number(su?.no_profile_events ?? 0),
    noProfileActors: Number(su?.no_profile_actors ?? 0),
    needLoginEvents: Number(su?.need_login_events ?? 0),
    needLoginActors: Number(su?.need_login_actors ?? 0),
  };

  const fn = pivotLong(funnel.map((r) => ({ group: r.stage, key: r.slot, events: r.events, actors: r.actors })));
  const eng = pivotLong(engagement.map((r) => ({ group: r.kind, key: r.key, events: r.events, actors: r.actors })));

  const outputs = output.filter((r) => r.category === "산출물").map((r) => ({
    key: r.key, cnt: Number(r.cnt), users: Number(r.users),
  }));
  const costs = output.filter((r) => r.category === "원가").map((r) => ({
    key: r.key, calls: Number(r.cnt), users: Number(r.users), won: Number(r.cost_won ?? 0),
  }));
  const costTotal = costs.reduce((a, c) => a + c.won, 0);
  const callTotal = costs.reduce((a, c) => a + c.calls, 0);

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
    windowDays,
    summaryError, trendError, retentionError, funnelError, engagementError, outputError,
    today: kstDate(new Date().toISOString()),
    sum, byBucket, buckets, cohorts,
    fn, eng, outputs, costs, costTotal, callTotal,
  };
}

// ── 조각 컴포넌트 ────────────────────────────────────────────────────

/**
 * 비율 + 분자/분모 한 줄. 🔴 퍼센트만 보여주면 분자가 1~3명일 때 오독한다(이 화면의 표본이
 * 그렇다 — 재방문 표가 원래부터 같은 규약을 썼고 그걸 화면 전체로 넓혔다).
 * 🔴 문자열을 돌려주는 이유: Stat 카드와 표가 같은 표기를 써야 하는데 Stat.value 는 string 이다.
 *    JSX 조각으로 만들면 카드 쪽에서 캐스팅이 필요해지고, 그 캐스팅이 타입을 속인다.
 * 분모가 0 이면 pct1 이 null → "—"(0% 가 아니라 **잴 수 없다**).
 */
function rateText(num: number, den: number): string {
  const p = pct1(num, den);
  if (p === null) return "—";
  return `${formatMetric(p, "percent")} (${formatMetric(num, "count")}/${formatMetric(den, "count")})`;
}

/** (키 · 건수 · 사람) 3열 표. engagement·funnel 분해가 전부 같은 모양이라 한 곳에 둔다. */
function KeyTable({
  head,
  rows,
  labels,
}: {
  head: string;
  rows: { key: string; cell: Cell }[];
  labels?: Record<string, string>;
}) {
  if (rows.length === 0) return <div className="text-[12px] text-white/40">창 안 기록 없음</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-white/40 text-left">
            <th className="py-1 pr-3">{head}</th>
            <th className="py-1 px-2 text-right">건수</th>
            <th className="py-1 px-2 text-right">사람</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/5 text-white/70">
              {/* 매핑에 없는 키는 원본 그대로 — 별마루가 항목을 늘리면 데이터가 먼저 도착한다. */}
              <td className="py-1 pr-3">{labels?.[r.key] ?? r.key}</td>
              <td className="py-1 px-2 text-right">{formatMetric(r.cell.events, "count")}</td>
              <td className="py-1 px-2 text-right">{formatMetric(r.cell.actors, "count")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-white/35 leading-snug mt-2">{children}</p>;
}

// ── 화면 ─────────────────────────────────────────────────────────────

export default async function AdminByeolmaruPage() {
  const s = await load();
  const W = s.windowDays;

  const gate = s.fn.total("gate_shown");
  const trial = s.fn.total("trial_started");
  const subClick = s.fn.total("subscribe_clicked");
  const subDone = s.fn.total("subscribe_completed");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">별마루 <span className="text-white/40 text-sm">(리텐션 허브)</span></h1>
        <p className="text-[13px] text-white/50 mt-1">
          진입 → 허브 열람 → 페이월 노출 → 체험·구독, 그리고 산출물·원가.{" "}
          <b className="text-white/70">창은 최근 {W}일(KST)</b>이고 ① 진입 요약만 전 기간 누적이다.
        </p>
        <Note>
          🔴 별마루는 아직 <b className="text-white/60">prod 미배포</b>라 prod 에서는 이 화면의 모든
          블록이 조회 실패로 뜬다(테이블·RPC 가 아직 없다). dev 숫자만 의미가 있다.
        </Note>
      </div>

      {/* ① 진입 — 전 기간 누적(RPC 에 창이 없다). 추세는 아래 일별 표가 본다. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ① 진입 <span className="text-white/35">(전 기간 누적)</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="진입 PV" value={s.summaryError ? "—" : formatMetric(s.sum.pv, "count")} />
          <Stat label="진입 UV" value={s.summaryError ? "—" : formatMetric(s.sum.uv, "count")} />
          <Stat
            label="사주 프로필 없음"
            value={s.summaryError ? "—" : formatMetric(s.sum.noProfileEvents, "count")}
            sub={s.summaryError ? undefined : `${formatMetric(s.sum.noProfileActors, "count")}명`}
          />
          <Stat
            label="비로그인"
            value={s.summaryError ? "—" : formatMetric(s.sum.needLoginEvents, "count")}
            sub={s.summaryError ? undefined : `${formatMetric(s.sum.needLoginActors, "count")}명`}
          />
        </div>
        {s.summaryError && <LoadFailed block="admin_byeolmaru_summary" className="mt-2" />}
        <Note>
          PV·UV 는 <b className="text-white/60">허브(`/byeolmaru`) 만</b> 센다 — `/byeolmaru/day`·
          `/woori` 등 하위 페이지 조회는 안 들어간다(재방문 코호트도 같은 정의를 쓴다). 아래 두 칸은
          <b className="text-white/60"> 진입했는데 달력을 못 본</b> 경우다.
        </Note>
      </section>

      {/* ② 허브 열람 — 지금 실제로 사람들이 무엇을 누르는가. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ② 허브 열람 <span className="text-white/35">(최근 {W}일)</span>
        </h2>
        {s.engagementError ? (
          <LoadFailed block="admin_byeolmaru_engagement" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* 🔴 라벨에 창을 박아 둔다 — 이 칸만 admin_byeolmaru_summary(창 없음) 에서 오고
                  나머지 셋은 30일이다. 섹션 제목만 믿고 읽으면 한 칸이 다른 기간이라는 걸 놓친다.
                  (30일 치는 아래 일별 추세의 `날짜클릭` 열이 날짜별로 보여준다.) */}
              <Stat
                label="날짜 셀 클릭 (전 기간)"
                value={s.summaryError ? "—" : formatMetric(s.sum.daySelectedEvents, "count")}
                sub={s.summaryError ? undefined : `${formatMetric(s.sum.daySelectedActors, "count")}명`}
              />
              <Stat
                label="무료 목록 행"
                value={formatMetric(s.eng.total("free_item").events, "count")}
                sub={`${formatMetric(s.eng.total("free_item").actors, "count")}명`}
              />
              <Stat
                label="날짜 상세 탭 전환"
                value={formatMetric(s.eng.total("day_tab").events, "count")}
                sub={`${formatMetric(s.eng.total("day_tab").actors, "count")}명`}
              />
              <Stat
                label="공유 클릭"
                value={formatMetric(s.eng.total("share").events, "count")}
                sub={`${formatMetric(s.eng.total("share").actors, "count")}명`}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-6 mt-4">
              <div>
                <h3 className="text-[13px] text-white/50 mb-2">무료 목록 — 어느 행을 누르나</h3>
                <KeyTable head="항목" rows={s.eng.breakdown("free_item")} labels={FREE_ITEM_LABELS} />
              </div>
              <div>
                <h3 className="text-[13px] text-white/50 mb-2">날짜 상세 — 어느 탭으로 넘어가나</h3>
                <KeyTable head="도착 탭" rows={s.eng.breakdown("day_tab")} labels={DAY_TAB_LABELS} />
              </div>
            </div>
            <Note>
              🔴 <b className="text-white/60">타로·우리 도달은 두 표를 합쳐 읽어야 한다</b> — 목록 행으로
              가는 길과 날짜 상세에서 탭으로 넘어가는 길이 둘 다 있다. 한쪽만 보면 도달을 과소로 센다.
              탭 전환은 2단계 통합(`/byeolmaru/day`)의 성패를 재는 유일한 지표다.{" "}
              게스트 구경 클릭 {formatMetric(s.eng.total("guest_peek").events, "count")}건(
              {formatMetric(s.eng.total("guest_peek").actors, "count")}명)은 비로그인 진입분이다.
            </Note>
          </>
        )}
      </section>

      {/* ③ 페이월 → 체험·구독. 이 서비스의 수익 축인데 지금까지 어느 화면에도 없었다. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ③ 페이월 → 체험·구독 <span className="text-white/35">(최근 {W}일)</span>
        </h2>
        {s.funnelError ? (
          <LoadFailed block="admin_byeolmaru_funnel" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {FUNNEL_STAGES.map((st) => {
                const c = s.fn.total(st.stage);
                return (
                  <Stat
                    key={st.stage}
                    label={st.label}
                    value={formatMetric(c.events, "count")}
                    sub={`${formatMetric(c.actors, "count")}명`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {/* 🔴 분모·분자 모두 **사람 수**다. 건수로 재면 한 사람이 절단선을 78번 본 날
                  (dev 2026-09-27) 이 그대로 분모가 돼 전환율이 무의미해진다. */}
              <Stat label="노출 → 체험" value={rateText(trial.actors, gate.actors)} />
              <Stat label="노출 → 구독 클릭" value={rateText(subClick.actors, gate.actors)} />
              <Stat label="구독 클릭 → 완료" value={rateText(subDone.actors, subClick.actors)} />
            </div>
            <h3 className="text-[13px] text-white/50 mt-4 mb-2">페이월 노출 — 어느 절단선인가</h3>
            <KeyTable head="slot" rows={s.fn.breakdown("gate_shown")} labels={SLOT_LABELS} />
            <Note>
              🔴 <b className="text-white/60">엄밀한 깔때기가 아니다</b> — 체험·구독은 절단선을 안 보고도
              허브 배너 버튼에서 바로 시작할 수 있어서, 비율이 100%를 넘을 수 있다. "노출 대비 몇 명이
              시작했나"로만 읽을 것.{" "}
              <b className="text-white/60">사람 수는 더하지 말 것</b> — slot 별 행의 사람을 합치면 한
              사람이 여러 절단선을 봤을 때 중복된다. 합계는 DB 가 따로 센 값을 위 카드가 보여준다.{" "}
              slot `(없음)` 은 2026-09-13 이전 과거 데이터다(현재 계측은 항상 slot 을 보낸다).
            </Note>
          </>
        )}
      </section>

      {/* ④ 우리 오늘 — 살아남은 신호만. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ④ 우리 오늘 <span className="text-white/35">(최근 {W}일)</span>
        </h2>
        {s.engagementError ? (
          <LoadFailed block="admin_byeolmaru_engagement" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat
                label="상대 설정(교체)"
                value={formatMetric(s.eng.total("watch_set").events, "count")}
                sub={`${formatMetric(s.eng.total("watch_set").actors, "count")}명`}
              />
              <Stat
                label="관계칩 선택"
                value={formatMetric(s.eng.total("watch_status").events, "count")}
                sub={`${formatMetric(s.eng.total("watch_status").actors, "count")}명`}
              />
              <Stat
                label="락 CTA"
                value={formatMetric(s.eng.total("woori_cta").events, "count")}
                sub={`${formatMetric(s.eng.total("woori_cta").actors, "count")}명 · 출처 태그`}
              />
            </div>
            <Note>
              🔴 <b className="text-white/60">"상대 설정"은 누적으로 세지 말 것</b> — 2026-09-24 부터
              상대가 한 명이라 이 이벤트의 뜻이 "N번째 추가"가 아니라{" "}
              <b className="text-white/60">"지금 상대를 이 사람으로"(교체)</b>다. 경계 앞뒤가 같은
              이름이지만 다른 사건이다.{" "}
              🔴 <b className="text-white/60">락 CTA 는 퍼널의 단계가 아니라 출처 태그다</b> — 같은
              클릭이 ③의 체험·구독으로도 찍힌다(slot=`woori_30d`). ③에 더하면 이중계상이다.
            </Note>
          </>
        )}
      </section>

      {/* ⑤ 산출물 · 원가 — 구독 매출의 반대편. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          ⑤ 산출물 · LLM 원가 <span className="text-white/35">(최근 {W}일)</span>
        </h2>
        {s.outputError ? (
          <LoadFailed block="admin_byeolmaru_output" />
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-[13px] text-white/50 mb-2">생성된 산출물</h3>
                {s.outputs.length === 0 ? (
                  <div className="text-[12px] text-white/40">창 안 생성 없음</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-white/40 text-left">
                          <th className="py-1 pr-3">항목</th>
                          <th className="py-1 px-2 text-right">건수</th>
                          <th className="py-1 px-2 text-right">사람</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.outputs.map((o) => (
                          <tr key={o.key} className="border-t border-white/5 text-white/70">
                            <td className="py-1 pr-3">{o.key}</td>
                            <td className="py-1 px-2 text-right">{formatMetric(o.cnt, "count")}</td>
                            <td className="py-1 px-2 text-right">{formatMetric(o.users, "count")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-[13px] text-white/50 mb-2">LLM 원가 — 라우트 × 모델</h3>
                {s.costs.length === 0 ? (
                  <div className="text-[12px] text-white/40">창 안 호출 없음</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-white/40 text-left">
                          <th className="py-1 pr-3">라우트 · 모델</th>
                          <th className="py-1 px-2 text-right">호출</th>
                          <th className="py-1 px-2 text-right">원가</th>
                          <th className="py-1 px-2 text-right">건당</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.costs.map((c) => (
                          <tr key={c.key} className="border-t border-white/5 text-white/70">
                            <td className="py-1 pr-3 break-all">{c.key.replace("/api/byeolmaru/", "")}</td>
                            <td className="py-1 px-2 text-right">{formatMetric(c.calls, "count")}</td>
                            <td className="py-1 px-2 text-right">{formatMetric(c.won, "won")}</td>
                            {/* 🔴 건당은 won 으로 반올림하면 안 된다 — 생성당 ₩2.3 이 "2원"으로
                                뭉개져 nano→luna 전환(₩0.7→₩2.3)이 안 보인다. */}
                            <td className="py-1 px-2 text-right">
                              {c.calls > 0 ? `${formatMetric(c.won / c.calls, "ratio")}원` : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-white/20 text-white/90 font-semibold">
                          <td className="py-1 pr-3">합계</td>
                          <td className="py-1 px-2 text-right">{formatMetric(s.callTotal, "count")}</td>
                          <td className="py-1 px-2 text-right">{formatMetric(s.costTotal, "won")}</td>
                          <td className="py-1 px-2 text-right">
                            {s.callTotal > 0 ? `${formatMetric(s.costTotal / s.callTotal, "ratio")}원` : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <Note>
              리포트는 (사람, 날짜) 캐시라 <b className="text-white/60">생성 건수 = 캐시 미스 = 과금
              호출 수</b>다(되돌려 보기는 원가가 0이다). 모델을 접지 않는 이유: 2026-09-24 에 우리
              오늘이 nano→luna 로 바뀌며 생성당 원가가 뛰었는데, 합으로만 보면 그 전환이 안 보인다.{" "}
              <b className="text-white/60">구독 매출 쪽은 여기 없다</b> — 2층 「별마루 구독」 표가
              신규·만료·순증·소모 별을 본다(정의를 두 벌 만들지 않으려고 나눠 둔 것이다).
            </Note>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 추세 <span className="text-white/35">(최근 {W}일 · KST)</span></h2>
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
                      <td key={c.kind} className="py-1 px-2 text-right">
                        {formatMetric(s.byBucket[b]?.[c.kind] ?? 0, "count")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          전부 <b className="text-white/60">건수</b>다(UV 만 사람 수). ⚠️ `날짜클릭`의 구성은 두 번
          꺾였다 — P6-3 배포일(격자 접힘 + 스트립 신설)과 스트립 삭제일(2026-09-26)을 사이에 둔
          추세는 이름이 같아도 단절이니 행동 변화로 오독하지 말 것.
        </Note>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          D1~D7 재방문 <span className="text-white/35">(로그인 유저 · 최초 방문일 코호트 · 전 기간)</span>
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
                        return (
                          <td key={d} className="py-1 px-2 text-right">
                            {has ? rateText(returned, c.users) : <span className="text-white/25">— 관측 전</span>}
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
