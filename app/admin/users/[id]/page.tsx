// app/admin/users/[id]/page.tsx — 사용자 상세.
import { getServiceSupabase } from "@/lib/supabase";
import { UserActions } from "@/components/admin/UserActions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const [user, balance, profiles, readingCount] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase.from("star_balances").select("balance").eq("user_id", id).single(),
    supabase.from("user_profiles").select("*").eq("user_id", id),
    supabase.from("readings").select("id", { count: "exact", head: true }).eq("user_id", id),
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
      <UserActions userId={id} />
    </div>
  );
}
