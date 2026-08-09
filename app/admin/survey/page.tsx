// app/admin/survey/page.tsx — 정성 이탈조사 응답 원문 읽기
import { getServiceSupabase } from "@/lib/supabase";
import LoadFailed from "@/components/admin/LoadFailed";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  user_id: string | null;
  answers: { q: string; a: string }[];
  created_at: string;
}

export default async function AdminSurvey() {
  const supabase = getServiceSupabase();
  // 자유서술이라 정량 집계 없음 — 최신순 원문 리스트. 200건 상한(표시용).
  const { data, error } = await supabase
    .from("survey_responses")
    .select("id, user_id, answers, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const listFailed = !!error;
  const rows = (data ?? []) as Row[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const nameById = new Map<string, string | null>();
  let namesFailed = false;
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, nickname")
      .in("id", userIds);
    namesFailed = !!usersError;
    for (const u of users ?? []) nameById.set(u.id, u.nickname);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">이탈 설문</h1>
      <p className="text-white/50 text-xs">최신 200건 · 자유서술 응답 원문</p>
      {namesFailed && <LoadFailed block="작성자 닉네임(users)" />}
      {listFailed ? (
        <LoadFailed block="설문 응답(survey_responses)" />
      ) : rows.length === 0 ? (
        <p className="text-white/40 py-6 text-center">아직 응답이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-[12px] text-white/50 mb-3">
                <span>{r.user_id ? nameById.get(r.user_id) ?? "—" : "(탈퇴)"}</span>
                <span>{new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
              </div>
              <div className="space-y-2.5">
                {(r.answers ?? []).map((qa, i) => (
                  <div key={i}>
                    <div className="text-[12px] font-bold text-white/70">{qa.q}</div>
                    <div className="text-[13px] text-white/90 whitespace-pre-wrap mt-0.5">{qa.a}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
