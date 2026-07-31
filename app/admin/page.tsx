// app/admin/page.tsx — 대시보드.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList, adminExclusionArray } from "@/lib/admin";
import { Stat, Delta } from "@/components/admin/Stat";
import { startOfTodayKstIso, kstDate } from "@/lib/admin-time";
import {
  fillTrafficAxis,
  pickTodayYesterday,
  buildVisitorMix,
  pickTodayVisitorMix,
} from "@/lib/analytics/traffic";
import {
  attributeFreeSpend,
  buildStarSpendBreakdown,
  type StarLedgerRow,
  type StarTxRow,
  type ReadingInfo,
} from "@/lib/analytics/aggregate";

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
  // 탈퇴 — account_withdrawals 는 시각 컬럼이 withdrawn_at 이라 위 cnt(created_at) 를 못 쓴다.
  // ⚠️ 어드민 제외 불가: 이 테이블은 kakao_id_hash 만 남기고 user_id 를 안 남긴다(탈퇴 = 유저 삭제).
  //    그래서 운영자·내부 테스트 계정의 탈퇴도 이 숫자에 섞인다.
  // ⚠️ 탈퇴는 users DELETE CASCADE 라 그 유저의 결제·리딩·유입기록이 함께 사라진다 —
  //    즉 위 신규 가입/리딩 누적은 탈퇴분만큼 과거를 향해 줄어든다(이 카드가 그 규모를 보여준다).
  const withdrawn = (s?: string, u?: string) => {
    let q = supa.from("account_withdrawals").select("id", { count: "exact", head: true });
    if (s) q = q.gte("withdrawn_at", s);
    if (u) q = q.lt("withdrawn_at", u);
    return q;
  };
  // 매출(오늘/어제/누적) — 세 창을 SUM RPC 한 방으로. 이전 구현은 payments 행을 세 번 끌어와
  // 앱에서 reduce 했는데, 누적 갈래는 날짜 필터가 없어 결제 건수와 1:1 로 자라 Supabase
  // `Max rows`(서버 강제 상한, `.limit()` 을 조용히 덮어쓴다)에 닿을 다음 차례였다.
  // 합계는 반환이 항상 1행이라 cap 개념 자체가 소멸한다. 창 정의는 RPC 안: today = >= p_today,
  // yesterday = [p_yesterday, p_today), all = 날짜 필터 없음 — 구 pay() 3콜과 동일하다.
  const [tu, yu, au, tw, yw, aw, tr, yr, ar, revRes, errs, sens] = await Promise.all([
    cnt("users", "id", today), cnt("users", "id", yesterday, today), cnt("users", "id"),
    withdrawn(today), withdrawn(yesterday, today), withdrawn(),
    cnt("readings", "user_id", today), cnt("readings", "user_id", yesterday, today), cnt("readings", "user_id"),
    supa.rpc("admin_dashboard_revenue", { p_exclude, p_today: today, p_yesterday: yesterday }),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);
  // BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수
  const revRow = ((revRes.data ?? []) as { today_won: number; yesterday_won: number; all_won: number }[])[0];
  const revenue = {
    today: Number(revRow?.today_won ?? 0),
    yesterday: Number(revRow?.yesterday_won ?? 0),
    all: Number(revRow?.all_won ?? 0),
  };

  // 별 소모 (오늘/어제) — 어제 시작부터의 spend 를 한 번에 조회해 두 창으로 나눔
  // 🟡 이 쿼리와 아래 원장 쿼리 2개는 **의도적으로 앱측 집계로 남긴다.** 분류가 15단계 우선순위
  //    사다리 + free-first FIFO 귀속이라 SQL 이식은 별건의 고위험 작업이고, 이 결과가 손익 분석의
  //    입력이라 값이 바뀌면 판정 문서와 어긋난다. 실측 여유 ~851일 = 지금 서두를 이유가 없다.
  //    이건 2일 창이라 행수가 작다(아래 원장이 이 창의 소모 유저 전원의 전체 원장 = 더 큰 쪽).
  // ⚠️ 단 `.limit(100000)` 이 실효인 것은 Supabase `Max rows` 가 현재 **50,000** 이기 때문이다.
  //    1,000 으로 되돌리면 아래 원장(1,439행)이 즉시 조용히 잘린다 — 잊지 말 것.
  let txQ = supa
    .from("star_transactions")
    .select("id, user_id, type, amount, source, reading_id, created_at")
    .eq("type", "spend")
    .gte("created_at", yesterday)
    .limit(100000);
  if (excl) txQ = txQ.not("user_id", "in", excl);
  const { data: txAll } = await txQ;
  const tx = (txAll ?? []) as (StarTxRow & { id: string })[];
  const rids = [...new Set(tx.map((t) => t.reading_id).filter(Boolean))] as string[];
  const rById = new Map<string, ReadingInfo>();
  if (rids.length) {
    const { data: rinfo } = await supa
      .from("readings")
      .select("id, consultation_type, emotion_tag, relationship_id, skill_key")
      .in("id", rids);
    for (const r of rinfo ?? [])
      rById.set(r.id, { consultation_type: r.consultation_type, emotion_tag: r.emotion_tag, relationship_id: r.relationship_id, skill_key: r.skill_key });
  }
  // 무료 별 귀속 — 소모 유저들의 전체 원장으로 free-first 계산
  // 🟡 위와 같은 이유로 **의도적으로 앱측 집계**(free-first FIFO 는 원장 전체를 시간순으로 훑어야
  //    한다). 여기가 이 화면에서 가장 큰 쿼리다 — 2026-07-31 실측 **1,439행**.
  // ⚠️ Supabase `Max rows` 가 현재 50,000 이라 오늘은 안전하지만, 1,000 으로 되돌리면 이 쿼리가
  //    **즉시** 잘린다(PostgREST 는 200 + Content-Range 로 응답하고 supabase-js 는 에러로 승격하지
  //    않는다 = 조용한 오답). cap 을 만질 일이 생기면 이 두 쿼리를 먼저 볼 것.
  const spenders = [...new Set(tx.map((t) => t.user_id))];
  let freeById = new Map<string, number>();
  if (spenders.length) {
    const { data: ledger } = await supa
      .from("star_transactions")
      .select("id, user_id, type, amount, source, created_at")
      .in("user_id", spenders)
      .order("created_at", { ascending: true })
      .limit(100000);
    freeById = attributeFreeSpend((ledger ?? []) as StarLedgerRow[]);
  }
  const cut = Date.parse(today);
  const todayTx = tx.filter((t) => Date.parse(t.created_at) >= cut);
  const yestTx = tx.filter((t) => Date.parse(t.created_at) < cut);
  const spendT = buildStarSpendBreakdown(todayTx, rById, freeById);
  const spendY = buildStarSpendBreakdown(yestTx, rById, freeById);
  type SpendGroup = (typeof spendT)[number];
  const sumBy = (list: typeof spendT, pred: (g: SpendGroup) => boolean) =>
    list.filter(pred).reduce((s, g) => ({ stars: s.stars + g.stars, free: s.free + g.freeStars }), { stars: 0, free: 0 });
  const starOf = (pred: (g: SpendGroup) => boolean) => ({ today: sumBy(spendT, pred), yesterday: sumBy(spendY, pred).stars });
  // 연애 상담은 스킬 몫 분리 — 연애 상담(패스·연장·스레드) + 연애 스킬 소환(스킬:*) 합 = relationship 총액
  const isRelSkill = (g: SpendGroup) => g.domain === "relationship" && g.product.startsWith("스킬:");
  const star = {
    tarot: starOf((g) => g.domain === "tarot"),
    fortune: starOf((g) => g.domain === "fortune"),
    upsell: starOf((g) => g.domain === "upsell"),
    relationship: starOf((g) => g.domain === "relationship" && !isRelSkill(g)),
    relSkill: starOf(isRelSkill),
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

  // 연애 상담 KPI — 활성 패스는 현재 시점, 구매/스킬은 오늘 vs 어제
  const nowIso = new Date().toISOString();
  let apQ = supa.from("relationship_passes").select("id", { count: "exact", head: true }).gt("expires_at", nowIso);
  if (excl) apQ = apQ.not("user_id", "in", excl);
  // skill_key IS NOT NULL + (선택)excl — .not() 재할당 누적은 타입 깊이 폭발이라 삼항 한 표현식으로
  const skT = excl
    ? supa.from("readings").select("id", { count: "exact", head: true }).gte("created_at", today).not("skill_key", "is", null).not("user_id", "in", excl)
    : supa.from("readings").select("id", { count: "exact", head: true }).gte("created_at", today).not("skill_key", "is", null);
  const skY = excl
    ? supa.from("readings").select("id", { count: "exact", head: true }).gte("created_at", yesterday).lt("created_at", today).not("skill_key", "is", null).not("user_id", "in", excl)
    : supa.from("readings").select("id", { count: "exact", head: true }).gte("created_at", yesterday).lt("created_at", today).not("skill_key", "is", null);
  const [apRes, skTRes, skYRes] = await Promise.all([apQ, skT, skY]);
  const rel = {
    activePasses: apRes.count ?? 0,
    passBuys: {
      today: todayTx.filter((t) => t.source === "relationship_pass").length,
      yesterday: yestTx.filter((t) => t.source === "relationship_pass").length,
    },
    skillCalls: { today: skTRes.count ?? 0, yesterday: skYRes.count ?? 0 },
  };

  return {
    // ⚠️ uv(페이지뷰 귀속)와 mixUv(세션 시작 귀속)는 분모가 다르다 — 화면에서 mixUv 를 함께
    //    보여줘야 "신규+재방문 이 UV 와 안 맞는다"는 오독이 안 생긴다.
    today: { uv: pv.today.uv, pv: pv.today.pv, mixUv: mixToday.uv, newUv: mixToday.newUv, returningUv: mixToday.returningUv, newUsers: tu.count ?? 0, withdrawals: tw.count ?? 0, readings: tr.count ?? 0, revenueWon: revenue.today },
    yesterday: { uv: pv.yesterday.uv, pv: pv.yesterday.pv, newUsers: yu.count ?? 0, withdrawals: yw.count ?? 0, readings: yr.count ?? 0, revenueWon: revenue.yesterday },
    all: { newUsers: au.count ?? 0, withdrawals: aw.count ?? 0, readings: ar.count ?? 0, revenueWon: revenue.all },
    star,
    rel,
    alerts: { unresolvedErrors: errs.count ?? 0, unreviewedSensitive: sens.count ?? 0 },
  };
}

export default async function AdminDashboard() {
  const s = await loadStats();
  const starCard = (label: string, d: { today: { stars: number; free: number }; yesterday: number }) => (
    <Stat label={label} value={d.today.stars.toLocaleString()} paren={`무료 ${d.today.free.toLocaleString()}`}>
      <Delta today={d.today.stars} yesterday={d.yesterday} />
    </Stat>
  );
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">대시보드</h1>
      <section>
        <h2 className="text-sm text-white/60 mb-3">오늘 <span className="text-white/35">(KST 자정 기준)</span></h2>
        {/* 순서: 성과(가입 → 리딩 → 매출) 먼저, 트래픽(UV·PV)·탈퇴는 뒤. 매일 먼저 보는 값을
            왼쪽에 두는 배치 (퍼널 순서보다 판독 빈도 우선). UV/PV 는 봇 제외·어드민 제외 집계로
            /admin/traffic 과 같은 정의 (자세한 분해는 그 화면) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="신규 가입" value={s.today.newUsers}>
            <Delta today={s.today.newUsers} yesterday={s.yesterday.newUsers} />
          </Stat>
          <Stat label="리딩" value={s.today.readings}>
            <Delta today={s.today.readings} yesterday={s.yesterday.readings} />
          </Stat>
          <Stat label="매출(원)" value={s.today.revenueWon.toLocaleString()}>
            <Delta today={s.today.revenueWon} yesterday={s.yesterday.revenueWon} />
          </Stat>
          <Stat
            label="UV"
            value={s.today.uv.toLocaleString()}
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
            <Delta today={s.today.uv} yesterday={s.yesterday.uv} />
          </Stat>
          <Stat label="PV" value={s.today.pv.toLocaleString()}>
            <Delta today={s.today.pv} yesterday={s.yesterday.pv} />
          </Stat>
          <Stat label="탈퇴" value={s.today.withdrawals}>
            <Delta today={s.today.withdrawals} yesterday={s.yesterday.withdrawals} invert />
          </Stat>
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">전체 <span className="text-white/35">(누적 · 어제까지 대비)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="신규 가입" value={s.all.newUsers}>
            <Delta today={s.all.newUsers} yesterday={s.all.newUsers - s.today.newUsers} label="어제까지" />
          </Stat>
          {/* 탈퇴율 = 탈퇴 / (현재 유저 + 탈퇴). 탈퇴는 users 를 지우므로 "총 가입 이력" 을 이렇게 복원한다.
              ⚠️ 근사: 분모는 어드민 제외분(운영자·테스트 6명)이 빠졌지만 분자는 못 뺀다
              (account_withdrawals 에 user_id 가 없어 판별 불가) → 실제보다 소폭 높게 나온다. */}
          <Stat
            label="탈퇴"
            value={s.all.withdrawals}
            paren={s.all.newUsers + s.all.withdrawals > 0
              ? `가입대비 ${((s.all.withdrawals / (s.all.newUsers + s.all.withdrawals)) * 100).toFixed(1)}%`
              : undefined}
          >
            <Delta today={s.all.withdrawals} yesterday={s.all.withdrawals - s.today.withdrawals} label="어제까지" invert />
          </Stat>
          <Stat label="리딩" value={s.all.readings}>
            <Delta today={s.all.readings} yesterday={s.all.readings - s.today.readings} label="어제까지" />
          </Stat>
          <Stat label="매출(원)" value={s.all.revenueWon.toLocaleString()}>
            <Delta today={s.all.revenueWon} yesterday={s.all.revenueWon - s.today.revenueWon} label="어제까지" />
          </Stat>
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">별 소모 <span className="text-white/35">(오늘 · 별 · KST 자정 기준)</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {starCard("타로 대화", s.star.tarot)}
          {starCard("운세 리포트", s.star.fortune)}
          {starCard("인챗 업셀", s.star.upsell)}
          {starCard("연애 상담", s.star.relationship)}
          {starCard("연애 스킬 소환", s.star.relSkill)}
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">연애 상담 <span className="text-white/35">(오늘 · 활성 패스는 현재 시점)</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="활성 패스" value={s.rel.activePasses} />
          <Stat label="패스 구매" value={s.rel.passBuys.today}>
            <Delta today={s.rel.passBuys.today} yesterday={s.rel.passBuys.yesterday} />
          </Stat>
          <Stat label="스킬 호출" value={s.rel.skillCalls.today}>
            <Delta today={s.rel.skillCalls.today} yesterday={s.rel.skillCalls.yesterday} />
          </Stat>
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">처리 대기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="미해결 에러" value={s.alerts.unresolvedErrors} />
          <Stat label="미검토 민감알림" value={s.alerts.unreviewedSensitive} />
        </div>
      </section>
    </div>
  );
}
