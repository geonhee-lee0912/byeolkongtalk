// app/admin/page.tsx — 대시보드.
import type { ReactNode } from "react";
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList } from "@/lib/admin";
import { startOfAdminTodayKstIso } from "@/lib/admin-time";
import {
  attributeFreeSpend,
  buildStarSpendBreakdown,
  type StarLedgerRow,
  type StarSpendDomain,
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
  // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
  const pay = (s?: string, u?: string) => {
    let q = supa.from("payments").select("amount_won").eq("status", "completed").limit(100000);
    if (s) q = q.gte("created_at", s);
    if (u) q = q.lt("created_at", u);
    if (excl) q = q.not("user_id", "in", excl);
    return q;
  };
  const [tu, yu, au, tr, yr, ar, tp, yp, ap, errs, sens] = await Promise.all([
    cnt("users", "id", today), cnt("users", "id", yesterday, today), cnt("users", "id"),
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
  const domSum = (list: typeof spendT, d: StarSpendDomain) =>
    list.filter((g) => g.domain === d).reduce((s, g) => ({ stars: s.stars + g.stars, free: s.free + g.freeStars }), { stars: 0, free: 0 });
  const starDomain = (d: StarSpendDomain) => ({ today: domSum(spendT, d), yesterday: domSum(spendY, d).stars });
  const star = {
    saju: starDomain("saju"), tarot: starDomain("tarot"), fortune: starDomain("fortune"),
    relationship: starDomain("relationship"), upsell: starDomain("upsell"),
  };

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
    today: { newUsers: tu.count ?? 0, readings: tr.count ?? 0, revenueWon: sum(tp.data) },
    yesterday: { newUsers: yu.count ?? 0, readings: yr.count ?? 0, revenueWon: sum(yp.data) },
    all: { newUsers: au.count ?? 0, readings: ar.count ?? 0, revenueWon: sum(ap.data) },
    star,
    rel,
    alerts: { unresolvedErrors: errs.count ?? 0, unreviewedSensitive: sens.count ?? 0 },
  };
}

function Delta({ today, yesterday, label = "어제" }: { today: number; yesterday: number; label?: string }) {
  if (yesterday === 0) return <div className="text-[11px] text-white/40 mt-1">{label} 0</div>;
  const pct = ((today - yesterday) / yesterday) * 100;
  const cls = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-white/40";
  return (
    <div className="text-[11px] mt-1">
      <span className={cls}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>{" "}
      <span className="text-white/40">({label} {yesterday.toLocaleString()})</span>
    </div>
  );
}

function Stat({ label, value, paren, children }: { label: string; value: string | number; paren?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-[12px] text-white/60">{label}</div>
      <div className="text-2xl font-bold mt-1">
        {value}
        {paren && <span className="text-sm font-normal text-white/50 ml-1.5">({paren})</span>}
      </div>
      {children}
    </div>
  );
}

export default async function AdminDashboard() {
  const s = await loadStats();
  // 사주 대화는 신규 진입 폐쇄 — 이어가기(saju-fresh/deep) 잔여 소모 있을 때만 노출
  const showSaju = s.star.saju.today.stars + s.star.saju.yesterday > 0;
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.today.newUsers}>
            <Delta today={s.today.newUsers} yesterday={s.yesterday.newUsers} />
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.all.newUsers}>
            <Delta today={s.all.newUsers} yesterday={s.all.newUsers - s.today.newUsers} label="어제까지" />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {showSaju && starCard("사주 대화", s.star.saju)}
          {starCard("타로 대화", s.star.tarot)}
          {starCard("운세 리포트", s.star.fortune)}
          {starCard("연애 상담", s.star.relationship)}
          {starCard("인챗 업셀", s.star.upsell)}
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">연애 상담 <span className="text-white/35">(오늘 · 활성 패스는 현재 시점)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
