// app/api/admin/analytics/funnel/route.ts — 소재별 퍼널 + ad_spend 조인 CAC/ROAS.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildFunnel } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 선택 기간에 '가입'한 유저를 코호트로 (user_acquisition 은 users 와 1:1, created_at 동일 시점)
  // 어드민 활동 제외 — 코호트에서 빠지면 하위 readings/payments 도 자동 제외
  const excl = adminExclusionList();
  let acqQ = supa
    .from("user_acquisition")
    .select("user_id, utm_content, created_at")
    .gte("created_at", since)
    .limit(100000);
  if (excl) acqQ = acqQ.not("user_id", "in", excl);
  // 전체 window 유저 (추적 안 된 유입 포함, 코호트/추세와 동일 모집단) — admin 제외
  let usersQ = supa.from("users").select("id").gte("created_at", since).limit(100000);
  if (excl) usersQ = usersQ.not("id", "in", excl);
  const [{ data: acqs }, { data: allUsers }] = await Promise.all([acqQ, usersQ]);

  // acquisition + 전체 유저 합집합 (acq 는 대개 users 부분집합이지만 안전하게 union)
  const idSet = new Set<string>([
    ...(acqs ?? []).map((a) => a.user_id),
    ...(allUsers ?? []).map((u) => u.id),
  ]);
  const userIds = [...idSet];
  const [{ data: readings }, { data: payments }, { data: spend }] = await Promise.all([
    userIds.length
      ? supa.from("readings").select("user_id").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    userIds.length
      ? supa.from("payments").select("user_id, status, amount_won").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; status: string | null; amount_won: number | null }[] }),
    supa.from("ad_spend").select("creative_key, spend_won").gte("spend_date", since.slice(0, 10)).limit(100000),
  ]);

  return NextResponse.json({
    days,
    rows: buildFunnel({
      acquisitions: (acqs ?? []).map((a) => ({ user_id: a.user_id, utm_content: a.utm_content })),
      readings: readings ?? [],
      payments: payments ?? [],
      spend: spend ?? [],
      allUserIds: userIds,
    }),
  });
}
