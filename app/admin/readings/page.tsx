// app/admin/readings/page.tsx — 리딩 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { Pager } from "@/components/admin/Pager";

const PER_PAGE = 25;

function readingTitle(emotionTag: string | null, consultationType: string): string {
  const ft = fortuneTypeFromTag(emotionTag);
  if (ft) return FORTUNE_CONFIG[ft].label;
  return emotionTag ?? "고민 상담";
}

export const dynamic = "force-dynamic";

export default async function AdminReadings({
  searchParams,
}: { searchParams: Promise<{ type?: string; free?: string; page?: string }> }) {
  const { type, free, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PER_PAGE;
  const supabase = getServiceSupabase();
  let query = supabase.from("readings")
    .select("id, user_id, consultation_type, emotion_tag, stars_spent, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);
  if (type === "saju" || type === "tarot") query = query.eq("consultation_type", type);
  if (free === "1") query = query.eq("stars_spent", 0);
  const { data, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const makeHref = (p: number) => {
    const sp = new URLSearchParams();
    if (type) sp.set("type", type);
    if (free) sp.set("free", free);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/admin/readings?${qs}` : "/admin/readings";
  };

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
          <tr><th className="py-2">사용자</th><th>타입</th><th>제목</th><th>별</th><th>일시</th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-white/10">
              <td className="py-2 font-mono text-xs">{r.user_id.slice(0, 8)}</td>
              <td>{r.consultation_type}</td>
              <td>{readingTitle(r.emotion_tag, r.consultation_type)}</td>
              <td>{r.stars_spent}</td>
              <td>{new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
              <td className="text-right"><Link href={`/admin/readings/${r.id}`} className="text-lilac underline">보기</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} totalPages={totalPages} makeHref={makeHref} />
    </div>
  );
}
