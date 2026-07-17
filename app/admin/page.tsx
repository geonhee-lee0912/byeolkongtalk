// app/admin/page.tsx — 대시보드.
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionList } from "@/lib/admin";
import { startOfAdminTodayKstIso, daysAgoKstIso } from "@/lib/admin-time";

export const dynamic = "force-dynamic";

async function loadStats() {
  const supa = getServiceSupabase();
  const today = startOfAdminTodayKstIso(); // 오전 10시 롤오버 (밤샘 유입 짤림 방지)
  const week = daysAgoKstIso(6);
  // 어드민(운영자) 활동은 KPI 에서 제외 — 테스트 결제/리딩 지표 오염 방지
  const excl = adminExclusionList();
  // since 생략 시 날짜 필터 없이 전체(누적) 집계
  const cnt = (t: string, idCol: string, s?: string) => {
    let q = supa.from(t).select("id", { count: "exact", head: true });
    if (s) q = q.gte("created_at", s);
    if (excl) q = q.not(idCol, "in", excl);
    return q;
  };
  // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
  const pay = (s?: string) => {
    let q = supa.from("payments").select("amount_won").eq("status", "completed").limit(100000);
    if (s) q = q.gte("created_at", s);
    if (excl) q = q.not("user_id", "in", excl);
    return q;
  };
  const [tu, wu, au, tr, wr, ar, tp, wp, ap, errs, sens] = await Promise.all([
    cnt("users", "id", today), cnt("users", "id", week), cnt("users", "id"),
    cnt("readings", "user_id", today), cnt("readings", "user_id", week), cnt("readings", "user_id"),
    pay(today),
    pay(week),
    pay(),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);
  const sum = (rows: { amount_won: number }[] | null) => (rows ?? []).reduce((a, r) => a + (r.amount_won ?? 0), 0);
  return {
    today: { newUsers: tu.count ?? 0, readings: tr.count ?? 0, revenueWon: sum(tp.data) },
    week: { newUsers: wu.count ?? 0, readings: wr.count ?? 0, revenueWon: sum(wp.data) },
    all: { newUsers: au.count ?? 0, readings: ar.count ?? 0, revenueWon: sum(ap.data) },
    alerts: { unresolvedErrors: errs.count ?? 0, unreviewedSensitive: sens.count ?? 0 },
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-[12px] text-white/60">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

export default async function AdminDashboard() {
  const s = await loadStats();
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">대시보드</h1>
      <section>
        <h2 className="text-sm text-white/60 mb-3">오늘 <span className="text-white/35">(오전 10시 기준)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.today.newUsers} />
          <Stat label="리딩" value={s.today.readings} />
          <Stat label="매출(원)" value={s.today.revenueWon.toLocaleString()} />
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">최근 7일</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.week.newUsers} />
          <Stat label="리딩" value={s.week.readings} />
          <Stat label="매출(원)" value={s.week.revenueWon.toLocaleString()} />
        </div>
      </section>
      <section>
        <h2 className="text-sm text-white/60 mb-3">전체 <span className="text-white/35">(누적)</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="신규 가입" value={s.all.newUsers} />
          <Stat label="리딩" value={s.all.readings} />
          <Stat label="매출(원)" value={s.all.revenueWon.toLocaleString()} />
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
