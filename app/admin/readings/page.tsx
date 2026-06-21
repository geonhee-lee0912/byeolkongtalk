// app/admin/readings/page.tsx — 리딩 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminReadings({
  searchParams,
}: { searchParams: Promise<{ type?: string; free?: string }> }) {
  const { type, free } = await searchParams;
  const supabase = getServiceSupabase();
  let query = supabase.from("readings")
    .select("id, consultation_type, emotion_tag, stars_spent, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (type === "saju" || type === "tarot") query = query.eq("consultation_type", type);
  if (free === "1") query = query.eq("stars_spent", 0);
  const { data } = await query;

  const Tab = ({ label, href }: { label: string; href: string }) => (
    <Link href={href} className="px-3 py-1 rounded-full bg-white/10 text-xs">{label}</Link>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">리딩/상담</h1>
      <div className="flex gap-2">
        <Tab label="전체" href="/admin/readings" />
        <Tab label="사주" href="/admin/readings?type=saju" />
        <Tab label="타로" href="/admin/readings?type=tarot" />
        <Tab label="무료만" href="/admin/readings?free=1" />
      </div>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">타입</th><th>태그</th><th>별</th><th>일시</th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-white/10">
              <td className="py-2">{r.consultation_type}</td>
              <td>{r.emotion_tag ?? "-"}</td>
              <td>{r.stars_spent}</td>
              <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
              <td className="text-right"><Link href={`/admin/readings/${r.id}`} className="text-lilac underline">보기</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
