// app/admin/fortune-refunds/page.tsx — 운세 생성 실패 자동환불 모니터.
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFortuneRefunds() {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("fortune_refund_notices")
    .select("id, user_id, emotion_tag, refunded_stars, acknowledged_at, created_at")
    .order("created_at", { ascending: false }).limit(100);
  const total = (data ?? []).reduce((s, n) => s + (n.refunded_stars ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">운세 환불 (자동)</h1>
      <p className="text-sm text-white/60">운세 리포트 생성 실패 시 시스템이 자동 환불한 내역. 조회 전용. 누적 환불 별: <b>{total}</b></p>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">유저</th><th>운세</th><th>환불 별</th><th>확인</th><th>일시</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((n) => (
            <tr key={n.id} className="border-t border-white/10">
              <td className="py-2">{n.user_id.slice(0, 8)}</td>
              <td>{n.emotion_tag ?? "-"}</td>
              <td>{n.refunded_stars}</td>
              <td>{n.acknowledged_at ? "✅" : "—"}</td>
              <td>{new Date(n.created_at).toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
