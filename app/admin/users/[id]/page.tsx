// app/admin/users/[id]/page.tsx — 사용자 상세.
import Link from "next/link";
import { createHash } from "crypto";
import { getServiceSupabase } from "@/lib/supabase";
import { UserActions } from "@/components/admin/UserActions";
import { PopupSend } from "@/components/admin/PopupSend";
import { notFound } from "next/navigation";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";

function readingTitle(emotionTag: string | null, consultationType: string): string {
  const ft = fortuneTypeFromTag(emotionTag);
  if (ft) return FORTUNE_CONFIG[ft].label;
  return emotionTag ?? "고민 상담";
}

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceSupabase();
  const [user, balance, profiles, readings, actions, bonusTx] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase.from("star_balances").select("balance").eq("user_id", id).single(),
    supabase.from("user_profiles").select("*").eq("user_id", id),
    supabase.from("readings")
      .select("id, consultation_type, emotion_tag, stars_spent, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("admin_actions")
      .select("action, payload, created_at")
      .eq("target_type", "user").eq("target_id", id)
      .in("action", ["star_adjust", "fortune_grant"])
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("star_transactions")
      .select("source, amount")
      .eq("user_id", id)
      .in("source", ["welcome_bonus", "first_charge_bonus"]),
  ]);
  if (!user.data) notFound();

  // 이 카카오의 과거 탈퇴 횟수 (재가입 유저 판별) — account_withdrawals 는 탈퇴해도 남는 원장
  let withdrawalCount = 0;
  if (user.data.kakao_id) {
    const kakaoIdHash = createHash("sha256")
      .update(String(user.data.kakao_id))
      .digest("hex");
    const { count } = await supabase
      .from("account_withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("kakao_id_hash", kakaoIdHash);
    withdrawalCount = count ?? 0;
  }

  const bonusRows = bonusTx.data ?? [];
  const welcomeBonus = bonusRows.find((t) => t.source === "welcome_bonus");
  const firstChargeBonus = bonusRows.find((t) => t.source === "first_charge_bonus");

  // 이 유저 대상 개별 팝업 이력 + 확인 여부
  const { data: userPopups } = await supabase
    .from("popups")
    .select("id, title, created_at")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const popupIds = (userPopups ?? []).map((p) => p.id);
  const ackedAt = new Map<string, string>();
  if (popupIds.length) {
    const { data: acks } = await supabase
      .from("popup_acks")
      .select("popup_id, acknowledged_at")
      .eq("user_id", id)
      .in("popup_id", popupIds);
    for (const a of acks ?? []) ackedAt.set(a.popup_id, a.acknowledged_at);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">{user.data.nickname ?? id}</h1>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-white/5 p-3">별 잔액: <b>{balance.data?.balance ?? 0}</b></div>
        <div className="rounded bg-white/5 p-3">리딩 수: <b>{(readings.data ?? []).length}</b></div>
        <div className="rounded bg-white/5 p-3">웰컴 별: <b>{welcomeBonus ? `지급 (${welcomeBonus.amount}별)` : "미지급"}</b></div>
        <div className="rounded bg-white/5 p-3">첫 충전 보너스: <b>{firstChargeBonus ? `지급 (${firstChargeBonus.amount}별)` : "미지급"}</b></div>
        <div className="rounded bg-white/5 p-3">과거 탈퇴: <b>{withdrawalCount}회</b>{withdrawalCount > 0 ? " · 재가입 유저" : ""}</div>
      </div>
      <div>
        <div className="text-sm text-white/60 mb-2">생일 프로필 ({(profiles.data ?? []).length})</div>
        <ul className="text-sm space-y-1">
          {(profiles.data ?? []).map((p) => (
            <li key={p.id} className="rounded bg-white/5 px-3 py-2">
              {p.display_name} — {p.birth_date} {p.is_primary ? "★" : ""}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-sm text-white/60 mb-2">리딩 목록 ({(readings.data ?? []).length})</div>
        {(readings.data ?? []).length === 0 ? (
          <p className="text-sm text-white/40">리딩 없음</p>
        ) : (
          <ul className="text-sm space-y-1">
            {(readings.data ?? []).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/readings/${r.id}`}
                  className="rounded bg-white/5 px-3 py-2 flex justify-between gap-2 hover:bg-white/10 transition"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-white/40 mr-2">{r.consultation_type}</span>
                    {readingTitle(r.emotion_tag, r.consultation_type)}
                  </span>
                  <span className="text-white/40 shrink-0">
                    {r.stars_spent === 0 ? "무료" : `⭐${r.stars_spent}`} ·{" "}
                    {new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-sm text-white/60 mb-2">조정 이력</div>
        {(actions.data ?? []).length === 0 ? (
          <p className="text-sm text-white/40">이력 없음</p>
        ) : (
          <ul className="text-sm space-y-1">
            {(actions.data ?? []).map((a, i) => {
              const p = (a.payload ?? {}) as Record<string, unknown>;
              const date = new Date(a.created_at).toLocaleDateString("ko-KR");
              const desc = a.action === "star_adjust"
                ? `별 ${p.delta} 조정 · ${p.reason ?? ""}`
                : `무료 ${p.fortuneKind} ${p.bonus}회 부여 · ${p.reason ?? ""}`;
              return (
                <li key={i} className="rounded bg-white/5 px-3 py-2 flex justify-between gap-2">
                  <span>{desc}</span>
                  <span className="text-white/40 shrink-0">{date}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <UserActions userId={id} />
      <div>
        <div className="text-sm text-white/60 mb-2">
          보낸 팝업 ({(userPopups ?? []).length})
        </div>
        {(userPopups ?? []).length === 0 ? (
          <p className="text-sm text-white/40 mb-2">없음</p>
        ) : (
          <ul className="text-sm space-y-1 mb-3">
            {(userPopups ?? []).map((p) => {
              const acked = ackedAt.get(p.id);
              return (
                <li key={p.id} className="rounded bg-white/5 px-3 py-2 flex justify-between gap-2">
                  <span>{p.title}</span>
                  <span className="text-white/40 shrink-0">
                    {acked
                      ? `확인 ${new Date(acked).toLocaleDateString("ko-KR")}`
                      : "미확인"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <PopupSend userId={id} />
      </div>
    </div>
  );
}
