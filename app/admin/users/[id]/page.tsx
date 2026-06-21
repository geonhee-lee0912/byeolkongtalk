// app/admin/users/[id]/page.tsx — 사용자 상세.
import { getServiceSupabase } from "@/lib/supabase";
import { UserActions } from "@/components/admin/UserActions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const [user, balance, profiles, readingCount, actions] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase.from("star_balances").select("balance").eq("user_id", id).single(),
    supabase.from("user_profiles").select("*").eq("user_id", id),
    supabase.from("readings").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("admin_actions")
      .select("action, payload, created_at")
      .eq("target_type", "user").eq("target_id", id)
      .in("action", ["star_adjust", "fortune_grant"])
      .order("created_at", { ascending: false }).limit(50),
  ]);
  if (!user.data) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">{user.data.nickname ?? id}</h1>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-white/5 p-3">별 잔액: <b>{balance.data?.balance ?? 0}</b></div>
        <div className="rounded bg-white/5 p-3">리딩 수: <b>{readingCount.count ?? 0}</b></div>
      </div>
      <div>
        <div className="text-sm text-white/60 mb-2">생일 프로필 ({(profiles.data ?? []).length})</div>
        <ul className="text-sm space-y-1">
          {(profiles.data ?? []).map((p) => (
            <li key={p.id} className="rounded bg-white/5 px-3 py-2">
              {p.display_name} — {p.birth_date} {p.is_primary ? "★" : ""}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-sm text-white/60 mb-2">조정 이력</div>
        {(actions.data ?? []).length === 0 ? (
          <p className="text-sm text-white/40">이력 없음</p>
        ) : (
          <ul className="text-sm space-y-1">
            {(actions.data ?? []).map((a, i) => {
              const p = (a.payload ?? {}) as Record<string, unknown>;
              const date = new Date(a.created_at).toLocaleDateString("ko-KR");
              const desc = a.action === "star_adjust"
                ? `별 ${p.delta} 조정 · ${p.reason ?? ""}`
                : `무료 ${p.fortuneKind} ${p.bonus}회 부여 · ${p.reason ?? ""}`;
              return (
                <li key={i} className="rounded bg-white/5 px-3 py-2 flex justify-between gap-2">
                  <span>{desc}</span>
                  <span className="text-white/40 shrink-0">{date}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <UserActions userId={id} />
    </div>
  );
}
