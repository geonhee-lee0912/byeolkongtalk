// app/admin/page.tsx — 대시보드.
import { getServiceSupabase } from "@/lib/supabase";
import { startOfTodayKstIso, daysAgoKstIso } from "@/lib/admin-time";

export const dynamic = "force-dynamic";

async function loadStats() {
  const supa = getServiceSupabase();
  const today = startOfTodayKstIso();
  const week = daysAgoKstIso(6);
  const cnt = (t: string, s: string) =>
    supa.from(t).select("id", { count: "exact", head: true }).gte("created_at", s);
  const [tu, wu, tr, wr, tp, wp, errs, sens] = await Promise.all([
    cnt("users", today), cnt("users", week), cnt("readings", today), cnt("readings", week),
    // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
    supa.from("payments").select("amount_won").eq("status", "completed").gte("created_at", today).limit(100000),
    // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
    supa.from("payments").select("amount_won").eq("status", "completed").gte("created_at", week).limit(100000),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);
  const sum = (rows: { amount_won: number }[] | null) => (rows ?? []).reduce((a, r) => a + (r.amount_won ?? 0), 0);
  return {
    today: { newUsers: tu.count ?? 0, readings: tr.count ?? 0, revenueWon: sum(tp.data) },
    week: { newUsers: wu.count ?? 0, readings: wr.count ?? 0, revenueWon: sum(wp.data) },
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
        <h2 className="text-sm text-white/60 mb-3">오늘</h2>
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
        <h2 className="text-sm text-white/60 mb-3">처리 대기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="미해결 에러" value={s.alerts.unresolvedErrors} />
          <Stat label="미검토 민감알림" value={s.alerts.unreviewedSensitive} />
        </div>
      </section>
    </div>
  );
}
