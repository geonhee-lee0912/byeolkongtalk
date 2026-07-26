// app/admin/page.tsx — 대시보드.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList } from "@/lib/admin";
import { Stat, Delta } from "@/components/admin/Stat";
import { startOfAdminTodayKstIso, adminKstDate } from "@/lib/admin-time";
import {
  buildTrafficTrend,
  pickTodayYesterday,
  type PageViewRow,
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
  const today = startOfAdminTodayKstIso(); // 오전 10시 롤오버 (밤샘 유입 짤림 방지)
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString();
  // 어드민(운영자) 활동은 KPI 에서 제외 — 테스트 결제/리딩 지표 오염 방지
  const excl = adminExclusionList();
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
  // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
  const pay = (s?: string, u?: string) => {
    let q = supa.from("payments").select("amount_won").eq("status", "completed").limit(100000);
    if (s) q = q.gte("created_at", s);
    if (u) q = q.lt("created_at", u);
    if (excl) q = q.not("user_id", "in", excl);
    return q;
  };
  const [tu, yu, au, tw, yw, aw, tr, yr, ar, tp, yp, ap, errs, sens] = await Promise.all([
    cnt("users", "id", today), cnt("users", "id", yesterday, today), cnt("users", "id"),
    withdrawn(today), withdrawn(yesterday, today), withdrawn(),
    cnt("readings", "user_id", today), cnt("readings", "user_id", yesterday, today), cnt("readings", "user_id"),
    pay(today),
    pay(yesterday, today),
    pay(),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);
  const sum = (rows: { amount_won: number }[] | null) => (rows ?? []).reduce((a, r) => a + (r.amount_won ?? 0), 0);

  // 별 소모 (오늘/어제) — 어제 시작부터의 spend 를 한 번에 조회해 두 창으로 나눔
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

  // 오늘 UV/PV — page_views. /admin/traffic 과 같은 순수 함수·같은 오전 10시 롤오버를 재사용해
  // 두 화면의 "오늘"이 어긋나지 않게 한다 (직접 세면 봇 제외·버킷 규칙이 갈라진다).
  // ⚠️ 어드민 제외는 .not(...) 단독으로 쓰면 안 된다 — page_views 는 비로그인 행의 user_id 가
  //    NULL 이고 `NULL NOT IN (...)` 은 NULL(=거짓)이라 비로그인 PV 가 전부 사라진다.
  let pvQ = supa
    .from("page_views")
    .select("anon_id, user_id, path, landing_variant, utm_content, is_bot, created_at")
    .gte("created_at", yesterday)
    .limit(100000);
  if (excl) pvQ = pvQ.or(`user_id.is.null,user_id.not.in.${excl}`);
  const { data: pvData } = await pvQ;
  const pvTrend = buildTrafficTrend({
    rows: (pvData ?? []) as PageViewRow[],
    days: 2,
    todayBucket: adminKstDate(new Date().toISOString()),
  });
  const pv = pickTodayYesterday(pvTrend);

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
    today: { uv: pv.today.uv, pv: pv.today.pv, newUsers: tu.count ?? 0, withdrawals: tw.count ?? 0, readings: tr.count ?? 0, revenueWon: sum(tp.data) },
    yesterday: { uv: pv.yesterday.uv, pv: pv.yesterday.pv, newUsers: yu.count ?? 0, withdrawals: yw.count ?? 0, readings: yr.count ?? 0, revenueWon: sum(yp.data) },
    all: { newUsers: au.count ?? 0, withdrawals: aw.count ?? 0, readings: ar.count ?? 0, revenueWon: sum(ap.data) },
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
        <h2 className="text-sm text-white/60 mb-3">오늘 <span className="text-white/35">(오전 10시 기준)</span></h2>
        {/* 퍼널 순서: 방문(UV·PV) → 가입 → 탈퇴 → 리딩 → 매출. UV/PV 는 봇 제외·어드민 제외 집계로
            /admin/traffic 과 같은 정의 (자세한 분해는 그 화면) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="UV" value={s.today.uv.toLocaleString()}>
            <Delta today={s.today.uv} yesterday={s.yesterday.uv} />
          </Stat>
          <Stat label="PV" value={s.today.pv.toLocaleString()}>
            <Delta today={s.today.pv} yesterday={s.yesterday.pv} />
          </Stat>
          <Stat label="신규 가입" value={s.today.newUsers}>
            <Delta today={s.today.newUsers} yesterday={s.yesterday.newUsers} />
          </Stat>
          <Stat label="탈퇴" value={s.today.withdrawals}>
            <Delta today={s.today.withdrawals} yesterday={s.yesterday.withdrawals} invert />
          </Stat>
          <Stat label="리딩" value={s.today.readings}>
            <Delta today={s.today.readings} yesterday={s.yesterday.readings} />
          </Stat>
          <Stat label="매출(원)" value={s.today.revenueWon.toLocaleString()}>
            <Delta today={s.today.revenueWon} yesterday={s.yesterday.revenueWon} />
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
        <h2 className="text-sm text-white/60 mb-3">별 소모 <span className="text-white/35">(오늘 · 별 · 오전 10시 기준)</span></h2>
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
