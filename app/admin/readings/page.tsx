// app/admin/readings/page.tsx — 리딩 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { Pager } from "@/components/admin/Pager";
import LoadFailed from "@/components/admin/LoadFailed";

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
    .is("relationship_id", null) // 우리 사이(스레드/verdict/스킬)는 /admin/relationship 에서 관리
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);
  if (type === "saju" || type === "tarot") query = query.eq("consultation_type", type);
  if (free === "1") query = query.eq("stars_spent", 0);
  // 🔴 목록 조회 실패를 빈 표로 위장하지 않는다 — "이 필터에 해당 건 없음"과 "쿼리가 죽었다"가
  //    같아 보이면 운영자가 빈 표를 사실로 믿는다(2026-07-28 cap 사고와 같은 뿌리).
  const { data, count, error: listError } = await query;
  const listFailed = !!listError;

  // 인챗 추가 구매(카드 더 뽑기·대화 연장) 합산 — 목록 별 칼럼에 (+N) 표기
  const inchatByReading = new Map<string, number>();
  let inchatFailed = false;
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) {
    const { data: txs, error: txError } = await supabase.from("star_transactions")
      .select("reading_id, amount")
      .in("reading_id", ids)
      .in("source", ["clarifier", "extend"]);
    inchatFailed = !!txError;
    for (const t of txs ?? []) {
      if (!t.reading_id) continue;
      inchatByReading.set(t.reading_id, (inchatByReading.get(t.reading_id) ?? 0) + Math.abs(t.amount));
    }
  }
  // 실패 시 페이저는 숨긴다 — count 가 없는데 1/1 을 그리는 것도 거짓말이다.
  const totalPages = listFailed ? 0 : Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
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
      <h1 className="text-xl font-bold">
        리딩/상담 <span className="text-white/40 text-sm font-normal">
          {listFailed ? "전체 —" : `전체 ${(count ?? 0).toLocaleString()}건`}
        </span>
      </h1>
      <div className="flex flex-wrap gap-2">
        <Tab label="전체" href="/admin/readings" />
        <Tab label="사주" href="/admin/readings?type=saju" />
        <Tab label="타로" href="/admin/readings?type=tarot" />
        <Tab label="무료만" href="/admin/readings?free=1" />
      </div>
      {/* 보강 조회 실패 — 목록은 살리되 별 칼럼의 (+N) 을 못 믿는다는 걸 밝힌다 */}
      {inchatFailed && <LoadFailed block="인챗 추가 구매(star_transactions)" />}
      {listFailed ? (
        <LoadFailed block="리딩 목록(readings)" />
      ) : (
      <div className="overflow-x-auto">
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
              <td className="whitespace-nowrap">
                {r.stars_spent}
                {inchatFailed ? (
                  <span className="text-white/40"> +—</span>
                ) : (inchatByReading.get(r.id) ?? 0) > 0 ? (
                  <span className="text-emerald-300"> +{inchatByReading.get(r.id)}</span>
                ) : null}
              </td>
              <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
              <td className="text-right"><Link href={`/admin/readings/${r.id}`} className="text-lilac underline">보기</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
      <Pager page={page} totalPages={totalPages} makeHref={makeHref} />
    </div>
  );
}
