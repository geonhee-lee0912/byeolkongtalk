// app/admin/errors/page.tsx
import { getServiceSupabase } from "@/lib/supabase";
import { ResolveButton } from "@/components/admin/ResolveButton";

export const dynamic = "force-dynamic";

export default async function AdminErrors() {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("error_logs")
    .select("*")
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">에러 로그</h1>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">메시지</th><th>해결</th><th>일시</th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className={`border-t border-white/10 ${!e.resolved_at ? "bg-red-500/10" : ""}`}>
              <td className="py-2 max-w-md truncate">{e.message}{e.route ? ` (${e.route})` : ""}</td>
              <td>{e.resolved_at ? "✅" : "미해결"}</td>
              <td>{new Date(e.created_at).toLocaleString("ko-KR")}</td>
              <td className="text-right">{!e.resolved_at && <ResolveButton id={e.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
