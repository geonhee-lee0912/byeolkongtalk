// app/admin/inquiries/page.tsx — 어드민 문의 목록
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  category: InquiryCategory;
  title: string;
  status: "open" | "answered";
  created_at: string;
  user_id: string;
}

export default async function AdminInquiries({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = getServiceSupabase();
  // 정렬은 최신순만. 미답변 우선 트리아지는 "미답변" 필터 탭 + 빨강 하이라이트로 처리
  // (Postgres 기본 정렬로는 status 커스텀 순서를 깔끔히 못 줌 → 굳이 넣지 않음).
  // 작성자 닉네임은 별도 조회로 매핑한다 — inquiries 는 users 로 향하는 FK 가 둘
  // (user_id, answered_by) 이라 PostgREST 임베드(users(...))가 모호해서 실패한다.
  let query = supabase
    .from("inquiries")
    .select("id, category, title, status, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "open" || status === "answered") {
    query = query.eq("status", status);
  }
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const nameById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, nickname")
      .in("id", userIds);
    for (const u of users ?? []) nameById.set(u.id, u.nickname);
  }

  const tab = (key: string, label: string) => (
    <Link
      href={key ? `/admin/inquiries?status=${key}` : "/admin/inquiries"}
      className={`px-3 py-1 rounded text-xs ${
        (status ?? "") === key ? "bg-lilac-deep text-white" : "bg-white/10 text-white/70"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">문의 / 고객센터</h1>
      <div className="flex gap-2">
        {tab("", "전체")}
        {tab("open", "미답변")}
        {tab("answered", "답변완료")}
      </div>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-2">분류</th>
            <th>제목</th>
            <th>작성자</th>
            <th>상태</th>
            <th>일시</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-t border-white/10 ${r.status === "open" ? "bg-red-500/10" : ""}`}
            >
              <td className="py-2">{INQUIRY_CATEGORIES[r.category] ?? r.category}</td>
              <td className="max-w-[16rem] truncate">{r.title}</td>
              <td>{nameById.get(r.user_id) ?? "—"}</td>
              <td>{r.status === "answered" ? "✅ 완료" : "미답변"}</td>
              <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
              <td className="text-right">
                <Link
                  href={`/admin/inquiries/${r.id}`}
                  className="text-lilac-deep hover:text-lilac underline text-xs"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-white/40">
                문의가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
