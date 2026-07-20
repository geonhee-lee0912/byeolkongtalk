// app/admin/sensitive/page.tsx
import { getServiceSupabase } from "@/lib/supabase";
import Link from "next/link";
import { ReviewButton } from "@/components/admin/ReviewButton";

export const dynamic = "force-dynamic";

export default async function AdminSensitive() {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("sensitive_alerts")
    .select("*")
    .order("reviewed_at", { ascending: true, nullsFirst: true })
    .order("severity", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">민감 알림</h1>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">카테고리</th><th>심각도</th><th>검토</th><th>일시</th><th></th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((a) => (
            <tr key={a.id} className={`border-t border-white/10 ${!a.reviewed_at ? "bg-red-500/10" : ""}`}>
              <td className="py-2">{a.category}</td>
              <td>{a.severity}</td>
              <td>{a.reviewed_at ? "✅ " + (a.action_taken ?? "") : "미검토"}</td>
              <td className="whitespace-nowrap">{new Date(a.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
              <td className="text-right">{!a.reviewed_at && <ReviewButton id={a.id} />}</td>
              <td className="py-2 text-right pl-2">
                <Link href={`/admin/sensitive/${a.id}`} className="text-lilac-deep hover:text-lilac underline text-xs">상세</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
