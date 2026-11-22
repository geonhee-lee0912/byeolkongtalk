// Vercel Cron (매일 04:10 KST, vercel.json) — 개인정보처리방침의 보유 기간이 지난 것을 파기한다(운영자 결정 애플-4-1A).
// 조건·삭제는 DB 함수 purge_expired_records(20261122000000)가 한다.
// 🔴 되돌릴 수 없다 — env RETENTION_PURGE 가 정확히 "on" 일 때만 지우고, 그 밖엔 세기만 한다.
//    운영에서 켜는 것이 '첫 삭제' 승인이다(운영자가 건수를 보고 Vercel 에서).
// Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 부른다. 시크릿이 없으면 무조건 거부.
// Vercel Cron 은 production 배포에서만 돈다 — dev 는 손으로 호출한다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cron/retention-purge";

type PurgeResult = {
  executed: boolean;
  withdrawals: number;
  bonus_claims: number;
  sensitive_alerts: number;
  review_notes: number;
  log_ip_ua: number;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mode = process.env.RETENTION_PURGE;
  // 빈칸·대문자가 섞이면 켠 줄 알고 매일 세기만 한다(/api/health 는 '있다'로 보인다)
  if (mode && mode !== "on") await logWarn('RETENTION_PURGE is set but not "on" — count only', { route: ROUTE });

  const { data, error } = await getServiceSupabase().rpc("purge_expired_records", {
    p_execute: mode === "on",
  });
  if (error) {
    await logError(error, { route: ROUTE });
    return NextResponse.json({ error: "purge_failed" }, { status: 500 });
  }

  const r = data as PurgeResult;
  // 파기 기록(건수만) — 세기만 한 날과 0건인 날은 남기지 않는다
  if (r.executed && r.withdrawals + r.bonus_claims + r.sensitive_alerts + r.review_notes + r.log_ip_ua > 0) {
    await logInfo("retention purge done", { route: ROUTE, extra: r });
  }
  return NextResponse.json(r);
}
