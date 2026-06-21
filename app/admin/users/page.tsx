// app/admin/users/page.tsx — 사용자 목록.
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = getServiceSupabase();
  let query = supabase.from("users")
    .select("id, nickname, profile_img, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (q) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.ilike("nickname", `%${escaped}%`);
  }
  const { data: users } = await query;

  const ids = (users ?? []).map((u) => u.id);

  // 집계 쿼리 — ids가 빈 배열이면 스킵
  type PayRow = { user_id: string; amount_won: number; status: string };
  type ReadRow = { user_id: string; consultation_type: string; emotion_tag: string | null };

  let payRows: PayRow[] = [];
  let readRows: ReadRow[] = [];
  if (ids.length > 0) {
    const [payRes, readRes] = await Promise.all([
      supabase.from("payments").select("user_id, amount_won, status").in("user_id", ids).eq("status", "completed"),
      supabase.from("readings").select("user_id, consultation_type, emotion_tag").in("user_id", ids),
    ]);
    payRows = (payRes.data ?? []) as PayRow[];
    readRows = (readRes.data ?? []) as ReadRow[];
  }

  // 결제 집계
  const payMap = new Map<string, { count: number; total: number }>();
  for (const r of payRows) {
    const cur = payMap.get(r.user_id) ?? { count: 0, total: 0 };
    payMap.set(r.user_id, { count: cur.count + 1, total: cur.total + r.amount_won });
  }

  // 리딩 집계 — 3버킷
  const readMap = new Map<string, { gomintalk: number; fortuneTarot: number; fortuneSaju: number }>();
  for (const r of readRows) {
    const cur = readMap.get(r.user_id) ?? { gomintalk: 0, fortuneTarot: 0, fortuneSaju: 0 };
    const ft = fortuneTypeFromTag(r.emotion_tag);
    if (ft === null) {
      cur.gomintalk += 1;
    } else if (r.consultation_type === "tarot") {
      cur.fortuneTarot += 1;
    } else {
      cur.fortuneSaju += 1;
    }
    readMap.set(r.user_id, cur);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">사용자</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="닉네임 검색"
          className="bg-white/10 rounded px-3 py-2 text-sm" />
        <button className="bg-lilac-deep px-3 py-2 rounded text-sm">검색</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-2 pr-3">프로필</th>
              <th className="pr-3">닉네임</th>
              <th className="pr-3">결제횟수</th>
              <th className="pr-3">평균결제</th>
              <th className="pr-3">누적결제</th>
              <th className="pr-3">고민톡</th>
              <th className="pr-3">운세타로</th>
              <th className="pr-3">운세사주</th>
              <th className="pr-3">가입일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const pay = payMap.get(u.id) ?? { count: 0, total: 0 };
              const avg = pay.count > 0 ? Math.round(pay.total / pay.count) : 0;
              const read = readMap.get(u.id) ?? { gomintalk: 0, fortuneTarot: 0, fortuneSaju: 0 };
              return (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="py-2 pr-3">
                    {u.profile_img
                      ? <img src={u.profile_img} alt="" className="w-7 h-7 rounded-full object-cover" />
                      : <div className="w-7 h-7 rounded-full bg-white/20" />}
                  </td>
                  <td className="pr-3">{u.nickname ?? "(없음)"}</td>
                  <td className="pr-3">{pay.count.toLocaleString()}</td>
                  <td className="pr-3">{avg.toLocaleString()}원</td>
                  <td className="pr-3">{pay.total.toLocaleString()}원</td>
                  <td className="pr-3">{read.gomintalk.toLocaleString()}</td>
                  <td className="pr-3">{read.fortuneTarot.toLocaleString()}</td>
                  <td className="pr-3">{read.fortuneSaju.toLocaleString()}</td>
                  <td className="pr-3">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-lilac underline">상세</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
