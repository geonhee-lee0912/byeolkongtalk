// 운영 헬스체크 — 필수 env 누락 검사 + Supabase REST ping
// 200 ok / 503 degraded.
// 배포 직후 https://(dev.)byeolkongtalk.com/api/health 로 검증.

import { NextResponse } from "next/server";
import { missingRequired, optionalPresence } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const missing = missingRequired();
  const optional = optionalPresence();

  const checks: Record<string, "ok" | "missing" | "error"> = {};

  // Supabase ping — error_logs 1행 SELECT (service_role 이므로 RLS 우회)
  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/error_logs?select=id&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      checks.supabase = r.ok ? "ok" : "error";
    } else {
      checks.supabase = "missing";
    }
  } catch {
    checks.supabase = "error";
  }

  const ok = missing.length === 0 && checks.supabase === "ok";

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      env: {
        required_missing: missing,
        optional_present: optional,
      },
      checks,
    },
    { status: ok ? 200 : 503 }
  );
}
