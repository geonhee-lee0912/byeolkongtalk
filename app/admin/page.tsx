// app/admin/page.tsx — 대시보드.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList, adminExclusionArray } from "@/lib/admin";
import { Stat, Delta } from "@/components/admin/Stat";
// 🔴 조회 실패를 0/빈 배열로 위장하지 않는다 — 규칙은 컴포넌트 헤더 주석 참조
import LoadFailed from "@/components/admin/LoadFailed";
import { startOfTodayKstIso, kstDate, daysAgoKstIso } from "@/lib/admin-time";
import {
  fillTrafficAxis,
  pickTodayYesterday,
  buildVisitorMix,
  pickTodayVisitorMix,
} from "@/lib/analytics/traffic";
import { Metric } from "@/components/admin/Metric";
import { Drilldown } from "@/components/admin/Drilldown";
import { ContributionHero } from "@/components/admin/ContributionHero";
import { BandGauge } from "@/components/admin/BandGauge";
import { GuardrailRow } from "@/components/admin/GuardrailRow";
import {
  rolling7,
  computeBand,
  costCoverage,
  pickBandAxis,
  dailyValues,
  adSpendStaleDays,
  type DailyPnl,
} from "@/lib/admin/band";
import { AlertStrip } from "@/components/admin/daily/AlertStrip";
import { SurveyInbox } from "@/components/admin/daily/SurveyInbox";
import { PaymentsToday } from "@/components/admin/daily/PaymentsToday";
import { PayRateTable } from "@/components/admin/daily/PayRateTable";
import { SubscriptionRow } from "@/components/admin/daily/SubscriptionRow";
import { CreativeTable } from "@/components/admin/daily/CreativeTable";
import { loadDaily } from "@/lib/admin/daily-load";
import { computeUnit, computeGuardrails, pct1, type GuardRow } from "@/lib/admin/layer1";

export const dynamic = "force-dynamic";

async function loadStats() {
  const supa = getServiceSupabase();
  const today = startOfTodayKstIso(); // KST 자정 — 어드민 전 화면 공통 기준 (lib/admin-time.ts)
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString();
  // 어드민(운영자) 활동은 KPI 에서 제외 — 테스트 결제/리딩 지표 오염 방지
  const excl = adminExclusionList(); // PostgREST in-리스트 문자열 (빈 목록이면 null)
  const p_exclude = adminExclusionArray(); // RPC 인자용 uuid[] (빈 배열이면 SQL 이 알아서 통과)
  // [s, u) 반개구간. 둘 다 생략 시 날짜 필터 없이 전체(누적) 집계
  const cnt = (t: string, idCol: string, s?: string, u?: string) => {
    let q = supa.from(t).select("id", { count: "exact", head: true });
    if (s) q = q.gte("created_at", s);
    if (u) q = q.lt("created_at", u);
    if (excl) q = q.not(idCol, "in", excl);
    return q;
  };
  // 매출(오늘/어제/누적) — 세 창을 SUM RPC 한 방으로. 이전 구현은 payments 행을 세 번 끌어와
  // 앱에서 reduce 했는데, 누적 갈래는 날짜 필터가 없어 결제 건수와 1:1 로 자라 Supabase
  // `Max rows`(서버 강제 상한, `.limit()` 을 조용히 덮어쓴다)에 닿을 다음 차례였다.
  // 합계는 반환이 항상 1행이라 cap 개념 자체가 소멸한다. 창 정의는 RPC 안: today = >= p_today,
  // yesterday = [p_yesterday, p_today), all = 날짜 필터 없음 — 구 pay() 3콜과 동일하다.
  // 오늘/어제 리딩은 종목별로 센다 — 오늘의 운세가 별마루(별도 테이블)로 옮겨간 뒤(2026-09-28)
  // readings 전체 한 칸은 사실상 타로톡만 남아 별마루·사주 운세가 안 보였다.
  // 타로톡 = 타로 상담(운세 리포트 제외 · emotion_tag NULL 은 3값 논리라 명시) / 사주 운세 = fortune: 리포트 /
  // 별마루 = 오늘 사주 리포트 + 오늘 타로 뽑기 + 우리 오늘(각 테이블 created_at 기준, 그날 만들어진 것).
  // 연애 상담·시뮬(readings 의 나머지)은 이 줄에서 빠진다 — 누적 칸은 여전히 readings 전체.
  type Kind = "tarot" | "fortune" | "bm_report" | "bm_card" | "bm_pair";
  const KIND_TABLE: Record<Kind, string> = {
    tarot: "readings", fortune: "readings",
    bm_report: "byeolmaru_daily_report", bm_card: "byeolmaru_daily_card", bm_pair: "byeolmaru_pair_narrative",
  };
  const kindCnt = (k: Kind, s: string, u?: string) => {
    // 별마루 테이블엔 id 컬럼이 없다 → "*" head count
    let q = supa.from(KIND_TABLE[k]).select("*", { count: "exact", head: true }).gte("created_at", s);
    if (u) q = q.lt("created_at", u);
    if (k === "tarot") q = q.eq("consultation_type", "tarot").or("emotion_tag.is.null,emotion_tag.not.like.fortune:*");
    if (k === "fortune") q = q.like("emotion_tag", "fortune:%");
    if (excl) q = q.not("user_id", "in", excl);
    return q;
  };
  const KINDS: Kind[] = ["tarot", "fortune", "bm_report", "bm_card", "bm_pair"];
  const kindRes = await Promise.all(KINDS.flatMap((k) => [kindCnt(k, today), kindCnt(k, yesterday, today)]));
  const readingsFailed = kindRes.some((r) => Boolean(r.error));
  const kindVal = (k: Kind, day: 0 | 1) => kindRes[KINDS.indexOf(k) * 2 + day].count ?? 0;
  const readingsBy = (day: 0 | 1) => {
    const bm = { report: kindVal("bm_report", day), card: kindVal("bm_card", day), pair: kindVal("bm_pair", day) };
    return { tarot: kindVal("tarot", day), fortune: kindVal("fortune", day), byeolmaru: bm.report + bm.card + bm.pair, bm };
  };

  const [tu, yu, au, tr, ar, revRes, errs, sens] = await Promise.all([
    cnt("users", "id", today), cnt("users", "id", yesterday, today), cnt("users", "id"),
    // tr = 오늘 readings 전체 — 누적 칸의 "어제까지"(누적 − 오늘) 계산용. 종목별 칸과 정의가 달라 따로 센다
    cnt("readings", "user_id", today), cnt("readings", "user_id"),
    supa.rpc("admin_dashboard_revenue", { p_exclude, p_today: today, p_yesterday: yesterday }),
    // 고장 신호 줄은 대응이 필요한 error·warn 만 센다 — info 는 "설계된 정상 신호"라 매일 빨간 줄을 켠다
    // (어드민 메뉴 뱃지 app/admin/layout.tsx 와 같은 기준).
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null).in("level", ["error", "warn"]),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);
  // BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수
  // 🔴 `?? 0` 은 "쿼리 실패"와 "진짜 0원"을 구분 불가능하게 만든다 — 실패 여부를 따로 들고
  //    올라가 화면이 0 대신 경고를 그리게 한다. 실패 판정은 /api/admin/traffic 과 같은 방식(.error).
  const revenueFailed = Boolean(revRes.error);
  const revRow = ((revRes.data ?? []) as { today_won: number; yesterday_won: number; all_won: number }[])[0];
  const revenue = {
    today: Number(revRow?.today_won ?? 0),
    yesterday: Number(revRow?.yesterday_won ?? 0),
    all: Number(revRow?.all_won ?? 0),
  };

  // 오늘 UV/PV + 방문자 구성 — /admin/traffic 과 **같은 RPC** 를 창만 좁혀(2일) 재사용한다.
  // 이전 구현은 page_views 원본을 .limit(100000) 으로 받아 앱에서 집계했는데, Supabase
  // `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 값이 잘렸다(2026-07-28 사고).
  // 봇 제외 · 어드민 제외(3값 논리) · KST 자정 버킷은 전부 RPC 안에 있다.
  // ⚠️ p_since 는 어제 시작이지만 admin_traffic_visitor_mix 의 prev 는 **전체 테이블** 기준이라
  //    2일 창에서도 "그제 왔던 사람"이 연속으로 정확히 잡힌다. 이게 RPC 로 옮긴 실질 이득이다 —
  //    이전 구조로는 2일치 행만 받아 계산 자체가 불가능했다.
  // ⚠️ visitor_mix 의 UV 는 **세션 시작 귀속**이라 trend 의 UV(페이지뷰 귀속)와 하루 1명 수준으로
  //    다를 수 있다. 두 지표를 같은 값으로 기대하지 말 것 — 자세한 근거는 RPC 주석.
  const todayBucket = kstDate(new Date().toISOString());
  const [trendRes, mixRes] = await Promise.all([
    supa.rpc("admin_traffic_trend", { p_since: yesterday, p_exclude }),
    supa.rpc("admin_traffic_visitor_mix", { p_since: yesterday, p_exclude }),
  ]);
  const trafficFailed = Boolean(trendRes.error) || Boolean(mixRes.error);
  const pv = pickTodayYesterday(
    fillTrafficAxis(
      ((trendRes.data ?? []) as { bucket: string; uv: number; pv: number }[]).map((r) => ({
        date: r.bucket,
        uv: Number(r.uv),
        pv: Number(r.pv),
      })),
      2,
      todayBucket
    )
  );
  const mixToday = pickTodayVisitorMix(
    buildVisitorMix(
      (
        (mixRes.data ?? []) as {
          bucket: string;
          uv: number;
          new_uv: number;
          streak_uv: number;
          back_uv: number;
        }[]
      ).map((r) => ({
        date: r.bucket,
        uv: Number(r.uv),
        newUv: Number(r.new_uv),
        streakUv: Number(r.streak_uv),
        backUv: Number(r.back_uv),
      }))
    )
  );

  return {
    // ⚠️ uv(페이지뷰 귀속)와 mixUv(세션 시작 귀속)는 분모가 다르다 — 화면에서 mixUv 를 함께
    //    보여줘야 "신규+재방문 이 UV 와 안 맞는다"는 오독이 안 생긴다.
    today: { uv: pv.today.uv, pv: pv.today.pv, mixUv: mixToday.uv, newUv: mixToday.newUv, returningUv: mixToday.returningUv, newUsers: tu.count ?? 0, readings: readingsBy(0), readingsAll: tr.count ?? 0, revenueWon: revenue.today },
    yesterday: { uv: pv.yesterday.uv, pv: pv.yesterday.pv, newUsers: yu.count ?? 0, readings: readingsBy(1), revenueWon: revenue.yesterday },
    all: { newUsers: au.count ?? 0, readings: ar.count ?? 0, revenueWon: revenue.all },
    alerts: { unresolvedErrors: errs.count ?? 0, unreviewedSensitive: sens.count ?? 0 },
    // 실패한 RPC 블록. 화면이 0 대신 "—" + 경고 한 줄을 그리는 데 쓴다.
    failed: { revenue: revenueFailed, traffic: trafficFailed, readings: readingsFailed, alerts: Boolean(errs.error || sens.error) },
  };
}

// 밴드는 8주(56개) 롤링 값이 필요하고, 롤링 한 개가 7일을 먹는다 → 62일치 일별 행.
const BAND_DAYS = 62;

async function loadLayer1() {
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const since = daysAgoKstIso(BAND_DAYS - 1);
  const win7 = daysAgoKstIso(6); // 오늘 포함 7일

  // 🔴 리텐션 2칸(D7·2일+방문)만 30일 코호트 — 7일 코호트로는 "가입 후 7일 성숙" 조건을
  //    만족하는 사람이 구조적으로 없어 분모가 0 이 된다(2026-09-27 실측: 7일 창 분모 0 /
  //    30일 창 640명). 가입·리딩·UV(활동량 3칸)는 그대로 win7(7일).
  const winRetention = daysAgoKstIso(29);

  const [pnlRes, unitRes, guardRes, qualityRes, flowRes] = await Promise.all([
    supa.rpc("admin_layer1_pnl", { p_since: since, p_exclude }),
    supa.rpc("admin_layer1_unit", { p_since: win7, p_until: null, p_exclude }),
    supa.rpc("admin_layer1_guard", { p_since: win7, p_until: null, p_exclude }),
    supa.rpc("admin_layer1_quality", { p_since: win7, p_until: null, p_exclude }),
    supa.rpc("admin_layer1_flow", { p_since: win7, p_until: null, p_exclude, p_retention_since: winRetention }),
  ]);

  // 🔴 NUMERIC 은 PostgREST 를 지나며 **문자열**로 온다 — BIGINT 와 같은 함정이다.
  //    Number() 를 빼면 cost 가 문자열 연결("0" + "12")로 더해져 조용히 틀린다.
  const days: DailyPnl[] = ((pnlRes.data ?? []) as Record<string, string>[]).map((r) => ({
    bucket: r.bucket,
    revenueWon: Number(r.revenue_won),
    adSpendWon: Number(r.ad_spend_won),
    adRows: Number(r.ad_rows),
    apiCostWon: Number(r.api_cost_won),
    costRows: Number(r.cost_rows),
  }));

  const last7 = days.slice(-7);
  const coverage = costCoverage(last7);
  const axis = pickBandAxis(days);
  const rolling = rolling7(dailyValues(days, axis));
  const band = computeBand(rolling);

  const unitRow = ((unitRes.data ?? []) as Record<string, string>[])[0];
  const unit = computeUnit({
    signups: Number(unitRow?.signups ?? 0),
    payers: Number(unitRow?.payers ?? 0),
    revenueWon: Number(unitRow?.revenue_won ?? 0),
    adSpendWon: Number(unitRow?.ad_spend_won ?? 0),
  });

  const guards = computeGuardrails(
    ((guardRes.data ?? []) as Record<string, string>[]).map(
      (r): GuardRow => ({ metric: r.metric, num: Number(r.num), den: Number(r.den) })
    )
  );

  // BIGINT 는 PostgREST 를 지나며 문자열로 온다 — 위 pnl/unit 과 같은 이유로 Number() 필수.
  const qRow = ((qualityRes.data ?? []) as Record<string, string>[])[0];
  const fRow = ((flowRes.data ?? []) as Record<string, string>[])[0];
  const quality = {
    newPaymentWon: Number(qRow?.new_payment_won ?? 0),
    repeatPaymentWon: Number(qRow?.repeat_payment_won ?? 0),
    subscriptionWon: Number(qRow?.subscription_won ?? 0),
    subscriptionStars: Number(qRow?.subscription_stars ?? 0),
    subsNet: Number(qRow?.subs_started ?? 0) - Number(qRow?.subs_expired ?? 0),
  };
  const flow = {
    signups: Number(fRow?.signups ?? 0),
    readings: Number(fRow?.readings ?? 0),
    uv: Number(fRow?.uv ?? 0),
    d7Return: Number(fRow?.d7_return ?? 0),
    d7Eligible: Number(fRow?.d7_eligible ?? 0),
    visit2: Number(fRow?.visit2 ?? 0),
    cohort: Number(fRow?.cohort ?? 0),
  };

  return {
    sum7: {
      revenueWon: last7.reduce((s, d) => s + d.revenueWon, 0),
      adSpendWon: last7.reduce((s, d) => s + d.adSpendWon, 0),
      apiCostWon: last7.reduce((s, d) => s + d.apiCostWon, 0),
    },
    coverage,
    axis,
    rolling,
    band,
    // 🔴 플랜 Task 6 절의 Step 4 코드 블록이 이 필드를 반환/전달에서 빠뜨렸다(Step 0-b 서술과
    //    불일치). ContributionHero.adStaleDays 는 필수 prop 이라 안 채우면 tsc 가 죽는다.
    adStaleDays: adSpendStaleDays(last7),
    unit,
    signups: Number(unitRow?.signups ?? 0),
    guards,
    quality,
    flow,
    failed: {
      pnl: Boolean(pnlRes.error),
      unit: Boolean(unitRes.error),
      guard: Boolean(guardRes.error),
      quality: Boolean(qualityRes.error),
      flow: Boolean(flowRes.error),
    },
  };
}

export default async function AdminDashboard() {
  const [s, L1, D] = await Promise.all([loadStats(), loadLayer1(), loadDaily()]);
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">대시보드</h1>

      {/* 🔴 1층(플랜B 단계3, Task 6) — 기존 섹션은 지우지 않는다. 위에 얹기만 한다.
          2층으로 옮기는 것은 Task 8. */}
      <section>
        {L1.failed.pnl && <LoadFailed className="mb-3" block="손익(admin_layer1_pnl)" />}
        {!L1.failed.pnl && (
          <>
            <ContributionHero
              revenueWon={L1.sum7.revenueWon}
              adSpendWon={L1.sum7.adSpendWon}
              apiCostWon={L1.sum7.apiCostWon}
              coverage={L1.coverage}
              adStaleDays={L1.adStaleDays}
            />
            {L1.band ? (
              <BandGauge
                band={L1.band}
                rolling={L1.rolling}
                axis={L1.axis}
                heroIncludesCost={L1.coverage.full}
              />
            ) : (
              <div className="text-[12px] text-white/40 mt-3">
                밴드는 8주치 롤링 값이 모여야 그린다 (현재 {L1.rolling.length}개).
              </div>
            )}
          </>
        )}
      </section>

      <section>
        {/* 🔴 히어로 바로 아래 — 매일 먼저 확인하는 값이라 1층의 7일 지표들보다 위에 둔다
            (2026-09-28 사용자 요청). ⚠️ 창이 다르다: 위 기여와 아래 매출의 질은 **7일**,
            이 줄만 **오늘 하루**다. 나란히 놓고 빼거나 비교하지 말 것. */}
        <h2 className="text-sm text-white/60 mb-3">오늘 <span className="text-white/35">(KST 자정 기준)</span></h2>
        {s.failed.revenue && <LoadFailed className="mb-3" block="매출(admin_dashboard_revenue)" />}
        {s.failed.traffic && (
          <LoadFailed className="mb-3" block="UV/PV·방문자 구성(admin_traffic_trend · admin_traffic_visitor_mix)" />
        )}
        {/* 순서: 성과(가입 → 리딩 → 매출) 먼저, 트래픽(UV·PV)은 뒤. 매일 먼저 보는 값을
            왼쪽에 두는 배치 (퍼널 순서보다 판독 빈도 우선). UV/PV 는 봇 제외·어드민 제외 집계로
            /admin/traffic 과 같은 정의 (자세한 분해는 그 화면)
            ⚠️ 탈퇴는 2층 `탈퇴 ▾` 로 내려갔다(Task 8) — 오늘/어제·누적·가입대비가 거기 다 있다. */}
        {s.failed.readings && <LoadFailed className="mb-3" block="종목별 리딩(readings · byeolmaru_*)" />}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Stat label="신규 가입" value={s.today.newUsers}>
            <Delta today={s.today.newUsers} yesterday={s.yesterday.newUsers} />
          </Stat>
          <Stat label="타로톡" value={s.failed.readings ? "—" : s.today.readings.tarot}>
            {!s.failed.readings && <Delta today={s.today.readings.tarot} yesterday={s.yesterday.readings.tarot} />}
          </Stat>
          <Stat label="사주 운세" value={s.failed.readings ? "—" : s.today.readings.fortune}>
            {!s.failed.readings && <Delta today={s.today.readings.fortune} yesterday={s.yesterday.readings.fortune} />}
          </Stat>
          <Stat
            label="별마루"
            value={s.failed.readings ? "—" : s.today.readings.byeolmaru}
            sub={
              s.failed.readings ? undefined : (
                <>
                  사주 {s.today.readings.bm.report} · 타로 {s.today.readings.bm.card} · 우리 오늘 {s.today.readings.bm.pair}
                </>
              )
            }
          >
            {!s.failed.readings && <Delta today={s.today.readings.byeolmaru} yesterday={s.yesterday.readings.byeolmaru} />}
          </Stat>
          <Stat label="매출(원)" value={s.failed.revenue ? "—" : s.today.revenueWon.toLocaleString()}>
            {!s.failed.revenue && <Delta today={s.today.revenueWon} yesterday={s.yesterday.revenueWon} />}
          </Stat>
          <Stat
            label="UV"
            value={s.failed.traffic ? "—" : s.today.uv.toLocaleString()}
            sub={
              s.today.mixUv > 0 ? (
                <>
                  세션 {s.today.mixUv.toLocaleString()} 중 신규{" "}
                  {s.today.newUv.toLocaleString()} · 재방문{" "}
                  {s.today.returningUv.toLocaleString()}
                </>
              ) : undefined
            }
          >
            {!s.failed.traffic && <Delta today={s.today.uv} yesterday={s.yesterday.uv} />}
          </Stat>
          <Stat label="PV" value={s.failed.traffic ? "—" : s.today.pv.toLocaleString()}>
            {!s.failed.traffic && <Delta today={s.today.pv} yesterday={s.yesterday.pv} />}
          </Stat>
        </div>
      </section>

      <AlertStrip
        unresolvedErrors={s.alerts.unresolvedErrors}
        unreviewedSensitive={s.alerts.unreviewedSensitive}
        alertsFailed={s.failed.alerts}
        syncAlert={D.syncAlert}
      />

      <section>
        <h2 className="text-sm text-white/60 mb-3">새 설문</h2>
        {D.survey.failed ? (
          <LoadFailed block="새 설문(survey_responses · admin_seen_markers)" />
        ) : (
          <SurveyInbox count={D.survey.count} items={D.survey.items} seenUntil={D.survey.seenUntil} />
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">오늘 결제</h2>
        {D.payments.failed ? (
          <LoadFailed block="오늘 결제(payments · star_transactions)" />
        ) : (
          <PaymentsToday items={D.payments.items} totalWon={D.payments.totalWon} truncated={D.payments.truncated} />
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          결제율 <span className="text-white/35">(가입 후 48시간 안 결제 · 전체 유입)</span>
        </h2>
        {D.payRate.failed ? (
          <LoadFailed block="결제율(admin_pay_rate)" />
        ) : (
          <PayRateTable today={D.payRate.today} yesterday={D.payRate.yesterday} mature7={D.payRate.mature7} />
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">별마루 구독</h2>
        {D.subscription.failed ? (
          <LoadFailed block="별마루 구독(admin_layer2_subscription)" />
        ) : (
          <SubscriptionRow today={D.subscription.today} last7={D.subscription.last7} />
        )}
      </section>


      <section>
        <h2 className="text-sm text-white/60 mb-3">
          흐름{" "}
          <span className="text-white/35">
            (가입·리딩·UV 는 최근 7일 · 리텐션 2종은 30일 코호트 · UV 는 페이지뷰 귀속)
          </span>
        </h2>
        {L1.failed.flow ? (
          <LoadFailed block="흐름(admin_layer1_flow)" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Metric metricKey="signups_count" value={L1.flow.signups} n={0} />
            <Metric metricKey="readings_count" value={L1.flow.readings} n={0} />
            <Metric metricKey="uv_pageview" value={L1.flow.uv} n={0} />
            <Metric
              metricKey="d7_return"
              value={pct1(L1.flow.d7Return, L1.flow.d7Eligible)}
              n={L1.flow.d7Eligible}
              sub={`30일 코호트 중 7일 성숙 ${L1.flow.d7Eligible.toLocaleString("ko-KR")}명`}
            />
            <Metric
              metricKey="visit_2d_plus"
              value={pct1(L1.flow.visit2, L1.flow.cohort)}
              n={L1.flow.cohort}
              sub="30일 코호트"
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          단가 <span className="text-white/35">(최근 7일 가입 코호트 귀속)</span>
        </h2>
        {L1.failed.unit ? (
          <LoadFailed block="단가(admin_layer1_unit)" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric metricKey="cac_won" value={L1.unit.cacWon} n={L1.signups} />
            <Metric
              metricKey="rev_per_signup"
              value={L1.unit.revPerSignup}
              n={L1.signups}
              sub="= 결제율 × ARPPU"
            />
            <Metric metricKey="pay_rate" value={L1.unit.payRate} n={L1.signups} />
            <Metric metricKey="arppu_won" value={L1.unit.arppuWon} n={L1.signups} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          광고 소재 <span className="text-white/35">(최근 7일)</span>
          <span className="ml-2 text-[12px] text-white/35">
            {D.creatives.activeKnown ? "지금 게재 중인 광고만" : "게재 상태 미확인 — 지출 있는 소재 전부"}
          </span>
        </h2>
        {D.creatives.failed ? (
          <LoadFailed block="광고 소재(admin_funnel · ad_spend)" />
        ) : (
          <CreativeTable
            items={D.creatives.items} truncated={D.creatives.truncated}
            activeKnown={D.creatives.activeKnown} untracked={D.creatives.untracked} organic={D.creatives.organic}
          />
        )}
      </section>


      {/* 2층(플랜B 단계4, Task 8) — 펼칠 때만 /api/admin/layer2 를 친다. 섹션 8개를 미리 다
          돌리면 첫 페인트가 죽는다. 기존 어드민 화면은 지우지 않고 링크 블록의 목적지로 남는다. */}
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          왜 <span className="text-white/35">(클릭해서 펼침 · 최근 7일)</span>
        </h2>
        <div className="space-y-2">
          <Drilldown section="contribution" label="기여 — 상품별 기여마진" days={7} />
          <Drilldown section="revenue" label="매출 — 별 소모 · 패키지 · 연애 상담" days={7} />
          {/* 🔴 '체험 전환'을 뺐다 — 담당자 없는 약속이었다(플랜 전문에서 '체험'은 이 라벨
              한 곳에만 나오고 뒤 태스크가 받지 않는다). 근거는 route.ts 의 subscription 절. */}
          <Drilldown section="subscription" label="별마루 구독 — 신규·해지·구독 중 방문" days={7} />
          <Drilldown section="signups" label="신규 가입 — 유입 경로 · 무료 상품 공유" days={7} />
          <Drilldown section="readings" label="리딩 — 종목별 · 완료율 · 결과 열람" days={7} />
          <Drilldown section="uv" label="UV — 라우트별 · 경로 판독기" days={7} />
          <Drilldown section="d7" label="D7 — 코호트 리텐션 곡선" days={7} />
          <Drilldown section="withdrawal" label="탈퇴 — 오늘·누적·이탈 설문" days={7} />
        </div>
      </section>

      <section className="opacity-80">
        <h2 className="text-sm text-white/60 mb-3">
          보관함 · 매출의 질 <span className="text-white/35">(최근 7일)</span>
        </h2>
        {L1.failed.quality ? (
          <LoadFailed block="매출의 질(admin_layer1_quality)" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric metricKey="new_payment_won" value={L1.quality.newPaymentWon} n={0} />
            <Metric metricKey="repeat_payment_won" value={L1.quality.repeatPaymentWon} n={0} />
            <Metric
              metricKey="subscription_won"
              value={L1.quality.subscriptionWon}
              n={0}
              sub={`전체 ${L1.quality.subscriptionStars.toLocaleString("ko-KR")}별 중 유료별만 환산`}
            />
            <Metric metricKey="subscriber_net" value={L1.quality.subsNet} n={0} />
          </div>
        )}
      </section>

      <section className="opacity-80">
        <h2 className="text-sm text-white/60 mb-3">보관함 · 가드레일</h2>
        {L1.failed.guard ? <LoadFailed block="가드레일(admin_layer1_guard)" /> : <GuardrailRow guards={L1.guards} />}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">전체 <span className="text-white/35">(누적 · 어제까지 대비)</span></h2>
        {s.failed.revenue && <LoadFailed className="mb-3" block="매출(admin_dashboard_revenue)" />}
        {/* ⚠️ 탈퇴·누적 탈퇴율은 2층 `탈퇴 ▾` 로 내려갔다(Task 8). 산식(탈퇴 / (현재 유저 + 탈퇴))과
            어드민 제외 비대칭 caveat 도 함께 옮겼다 — app/api/admin/layer2/route.ts 의 withdrawal 절.
            ⚠️ 아래 누적 가입·리딩·매출은 탈퇴분만큼 **과거를 향해 줄어든다** — 탈퇴는 users DELETE
            CASCADE 라 그 유저의 결제·리딩·유입기록이 함께 사라진다. 어제보다 누적이 작아져도
            버그가 아니다. 그 규모는 2층 `탈퇴 ▾` 가 보여준다. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.all.newUsers}>
            <Delta today={s.all.newUsers} yesterday={s.all.newUsers - s.today.newUsers} label="어제까지" />
          </Stat>
          <Stat label="리딩" value={s.all.readings}>
            <Delta today={s.all.readings} yesterday={s.all.readings - s.today.readingsAll} label="어제까지" />
          </Stat>
          <Stat label="매출(원)" value={s.failed.revenue ? "—" : s.all.revenueWon.toLocaleString()}>
            {!s.failed.revenue && (
              <Delta today={s.all.revenueWon} yesterday={s.all.revenueWon - s.today.revenueWon} label="어제까지" />
            )}
          </Stat>
        </div>
      </section>
    </div>
  );
}
