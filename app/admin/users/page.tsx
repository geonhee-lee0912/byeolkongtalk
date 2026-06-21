// app/admin/users/page.tsx — 사용자 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = getServiceSupabase();
  let query = supabase.from("users")
    .select("id, nickname, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (q) query = query.ilike("nickname", `%${q}%`);
  const { data: users } = await query;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">사용자</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="닉네임 검색"
          className="bg-white/10 rounded px-3 py-2 text-sm" />
        <button className="bg-lilac-deep px-3 py-2 rounded text-sm">검색</button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">닉네임</th><th>가입일</th><th></th></tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id} className="border-t border-white/10">
              <td className="py-2">{u.nickname ?? "(없음)"}</td>
              <td>{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
              <td className="text-right">
                <Link href={`/admin/users/${u.id}`} className="text-lilac underline">상세</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
