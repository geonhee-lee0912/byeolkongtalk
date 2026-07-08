// app/api/admin/analytics/cohorts/route.ts — 가입 주차 코호트 LTV/리텐션 (최근 12주).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildCohorts } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKS = 12;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const since = daysAgoKstIso(WEEKS * 7 - 1);
  const supa = getServiceSupabase();

  // 어드민 활동 제외 — 코호트에서 빠지면 하위 payments/activity 도 자동 제외
  const excl = adminExclusionList();
  let usersQ = supa
    .from("users").select("id, created_at").gte("created_at", since).limit(100000);
  if (excl) usersQ = usersQ.not("id", "in", excl);
  const { data: users } = await usersQ;
  const userIds = (users ?? []).map((u) => u.id);

  const [{ data: payments }, { data: activity }] = await Promise.all([
    userIds.length
      ? supa.from("payments").select("user_id, amount_won, status, created_at").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; amount_won: number | null; status: string | null; created_at: string }[] }),
    userIds.length
      ? supa.from("readings").select("user_id, created_at").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; created_at: string }[] }),
  ]);

  return NextResponse.json({
    weeks: WEEKS,
    cohorts: buildCohorts({
      users: users ?? [],
      payments: payments ?? [],
      activity: activity ?? [],
      weeks: WEEKS,
    }),
  });
}
