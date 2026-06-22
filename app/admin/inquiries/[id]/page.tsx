// app/admin/inquiries/[id]/page.tsx — 어드민 문의 상세 + 작성자 정보 + 답변
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "@/lib/inquiries";
import { InquiryReply } from "@/components/admin/InquiryReply";

export const dynamic = "force-dynamic";

export default async function AdminInquiryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const { data: inq } = await supabase.from("inquiries").select("*").eq("id", id).single();
  if (!inq) notFound();

  const [user, balance] = await Promise.all([
    supabase.from("users").select("nickname, created_at").eq("id", inq.user_id).single(),
    supabase.from("star_balances").select("balance").eq("user_id", inq.user_id).single(),
  ]);

  const category = inq.category as InquiryCategory;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/admin/inquiries" className="text-lilac-deep hover:text-lilac text-sm underline">
        ← 목록
      </Link>

      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-2 py-0.5 rounded text-xs bg-lilac-deep/40 text-lilac">
          {INQUIRY_CATEGORIES[category] ?? inq.category}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs ${
            inq.status === "answered" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {inq.status === "answered" ? "답변완료" : "미답변"}
        </span>
        <span className="text-white/50 text-sm">
          {new Date(inq.created_at).toLocaleString("ko-KR")}
        </span>
      </div>

      {/* 문의 내용 */}
      <div>
        <h1 className="text-lg font-bold text-white mb-2">{inq.title}</h1>
        <div className="bg-night-deep border border-white/10 rounded-lg p-4 text-white/90 whitespace-pre-wrap text-sm leading-relaxed">
          {inq.body}
        </div>
      </div>

      {/* 작성자 정보 */}
      <div className="bg-white/5 rounded-lg p-4 space-y-1 text-sm">
        <div className="text-white/50 text-xs mb-2">작성자 정보</div>
        <div className="text-white/80">
          닉네임: <b>{user.data?.nickname ?? "—"}</b>
        </div>
        <div className="text-white/70">
          user_id: <span className="font-mono text-white/90">{inq.user_id.slice(0, 8)}…</span>
          <Link
            href={`/admin/users/${inq.user_id}`}
            className="text-lilac-deep hover:text-lilac underline ml-2"
          >
            사용자 상세 →
          </Link>
        </div>
        <div className="text-white/70">별 잔액: <b>{balance.data?.balance ?? 0}</b></div>
        {user.data?.created_at && (
          <div className="text-white/70">
            가입일: {new Date(user.data.created_at).toLocaleDateString("ko-KR")}
          </div>
        )}
      </div>

      {/* 환불 카테고리면 결제 어드민 안내 */}
      {category === "refund" && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm">
          <span className="text-blue-200">
            환불·결제 문의입니다. 실제 환불은{" "}
            <Link href="/admin/payments" className="text-lilac-deep hover:text-lilac underline">
              결제/정산
            </Link>{" "}
            에서 처리하세요.
          </span>
        </div>
      )}

      {/* 답변 */}
      <div>
        <div className="text-white/50 text-xs mb-2">
          {inq.status === "answered" ? "답변 (재전송 시 사용자에게 다시 알림)" : "답변 작성"}
        </div>
        <InquiryReply id={inq.id} initial={inq.answer_body ?? ""} />
        {inq.answered_at && (
          <div className="text-white/40 text-xs mt-2">
            마지막 답변: {new Date(inq.answered_at).toLocaleString("ko-KR")}
          </div>
        )}
      </div>
    </div>
  );
}
