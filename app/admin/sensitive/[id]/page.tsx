// app/admin/sensitive/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { ReviewButton } from "@/components/admin/ReviewButton";

export const dynamic = "force-dynamic";

const CATEGORY_INFO: Record<string, { label: string; hotlines: string[] }> = {
  suicide: { label: "자살/자해", hotlines: ["자살예방 109", "정신건강 1577-0199", "보건복지 129"] },
  school_violence: { label: "학교폭력", hotlines: ["학교폭력 117", "청소년 1388"] },
  domestic_violence: { label: "가정폭력", hotlines: ["여성긴급 1366", "경찰 112"] },
  sexual_violence: { label: "성폭력", hotlines: ["여성긴급 1366", "해바라기센터"] },
  substance_abuse: { label: "약물/알코올", hotlines: ["마약류 1342", "보건 129"] },
  other: { label: "기타 위기", hotlines: ["정신건강 1577-0199"] },
};

const SEVERITY_STYLE: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-300",
  2: "bg-orange-500/20 text-orange-300",
  3: "bg-red-500/30 text-red-300 font-bold",
};

export default async function SensitiveAlertDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const { data: alert } = await supabase
    .from("sensitive_alerts")
    .select("*")
    .eq("id", id)
    .single();

  if (!alert) notFound();

  const catInfo = CATEGORY_INFO[alert.category] ?? {
    label: alert.category,
    hotlines: [] as string[],
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/admin/sensitive" className="text-lilac-deep hover:text-lilac text-sm underline">
          ← 목록
        </Link>
      </div>

      {/* 헤더: 카테고리 + 심각도 + 발생시각 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg font-bold text-white">{catInfo.label}</span>
        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_STYLE[alert.severity] ?? "bg-white/10 text-white/70"}`}>
          심각도 {alert.severity}
        </span>
        <span className="text-white/50 text-sm">
          {new Date(alert.created_at).toLocaleString("ko-KR")}
        </span>
      </div>

      {/* 신고 내용 카드 */}
      <div>
        <div className="text-white/50 text-xs mb-1">신고 내용</div>
        <div className="bg-night-deep border border-white/10 rounded-lg p-4 text-white/90 whitespace-pre-wrap text-sm leading-relaxed">
          {alert.message_text ?? "(내용 없음)"}
        </div>
      </div>

      {/* 매칭 키워드 + 탐지방식 */}
      <div className="space-y-2">
        {alert.matched_keywords && alert.matched_keywords.length > 0 && (
          <div>
            <div className="text-white/50 text-xs mb-1">매칭 키워드</div>
            <div className="flex flex-wrap gap-1">
              {(alert.matched_keywords as string[]).map((kw) => (
                <span key={kw} className="bg-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
        {alert.detection_method && (
          <div className="text-white/50 text-xs">
            탐지방식: <span className="text-white/70">{alert.detection_method}</span>
          </div>
        )}
      </div>

      {/* 사용자 정보 */}
      <div className="bg-white/5 rounded-lg p-4 space-y-1 text-sm">
        <div className="text-white/50 text-xs mb-2">사용자 정보</div>
        <div className="text-white/70">
          사용자:{" "}
          {alert.user_id
            ? <span className="font-mono text-white/90">{(alert.user_id as string).slice(0, 8)}…</span>
            : alert.anonymous_id
            ? <span className="font-mono text-white/90">익명 {(alert.anonymous_id as string).slice(0, 8)}…</span>
            : <span className="text-white/30">(없음)</span>}
        </div>
        {alert.reading_id && (
          <div className="text-white/70">
            대화:{" "}
            <Link
              href={`/admin/readings/${alert.reading_id}`}
              className="text-lilac-deep hover:text-lilac underline"
            >
              대화 전체 보기 →
            </Link>
          </div>
        )}
      </div>

      {/* 핫라인 안내 */}
      {catInfo.hotlines.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-300 text-xs font-semibold mb-2">운영자 안내 핫라인</div>
          <div className="flex flex-wrap gap-2">
            {catInfo.hotlines.map((h) => (
              <span key={h} className="bg-blue-500/20 text-blue-200 text-sm px-3 py-1 rounded font-mono">
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 검토 상태 */}
      <div>
        <div className="text-white/50 text-xs mb-2">검토 상태</div>
        {alert.reviewed_at ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm space-y-1">
            <div className="text-green-300 font-semibold">검토 완료</div>
            {alert.action_taken && (
              <div className="text-white/70">조치: <span className="text-white/90">{alert.action_taken}</span></div>
            )}
            {alert.review_note && (
              <div className="text-white/70">메모: <span className="text-white/90">{alert.review_note}</span></div>
            )}
            <div className="text-white/40 text-xs">{new Date(alert.reviewed_at as string).toLocaleString("ko-KR")}</div>
          </div>
        ) : (
          <div className="flex items-start">
            <ReviewButton id={alert.id} />
          </div>
        )}
      </div>
    </div>
  );
}
