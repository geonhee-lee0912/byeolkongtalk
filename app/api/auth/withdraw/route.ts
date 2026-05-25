// 회원 탈퇴 — 카카오 unlink + 본인 데이터 삭제 + 쿠키 정리.
//
// Phase 4 (b) 시점엔 stars/readings/payments 테이블이 없어서 users 만 삭제.
// 추후 테이블 추가될 때마다 이 라우트에 삭제 단계 보강 필요:
//   Phase 4 (c): star_balances, star_transactions, payments
//   Phase 5: readings (transaction_id 순환 FK 끊기), messages (CASCADE)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession, clearAllCookies } from "@/lib/session";
import { unlinkKakao } from "@/lib/kakao";
import { logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  // CSRF: Origin/Referer 가 우리 도메인인지 확인
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowedOrigin = new URL(baseUrl).origin;
  const originOk = origin === allowedOrigin;
  const refererOk = referer ? referer.startsWith(allowedOrigin) : false;
  if (!originOk && !refererOk) {
    return NextResponse.json({ error: "csrf_blocked" }, { status: 403 });
  }

  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // kakao_id 조회 → unlink. 실패 시 503 + DB 삭제 중단 (좀비 OAuth 방지)
  const { data: userRow } = await supabase
    .from("users")
    .select("kakao_id")
    .eq("id", userId)
    .single();
  if (userRow?.kakao_id) {
    const ok = await unlinkKakao(userRow.kakao_id);
    if (!ok) {
      await logError(new Error("Kakao unlink failed during withdraw"), {
        route: "/api/auth/withdraw",
        userId,
        extra: {
          kakaoId: userRow.kakao_id,
          severity: "WITHDRAW_UNLINK_FAILED",
        },
      });
      return NextResponse.json(
        {
          error:
            "카카오 연결 해제에 실패했어. 잠시 후 다시 시도하거나 고객센터로 문의해줘",
        },
        { status: 503 }
      );
    }
  }

  // 본인 row 삭제 — star_transactions / star_balances 는 users ON DELETE CASCADE 라
  // users 삭제 시 자동 정리되지만, 명시적으로 먼저 비워서 의도 분명히 (감사 추적).
  // TODO (Phase 5): readings/messages 추가 + readings.transaction_id ↔ star_transactions.reading_id
  //                 순환 FK 끊기 단계 추가 (v1 패턴 참고)
  await Promise.all([
    supabase.from("star_transactions").delete().eq("user_id", userId),
    supabase.from("star_balances").delete().eq("user_id", userId),
  ]);

  // users 삭제 — error_logs.user_id FK 는 ON DELETE SET NULL 이라 자동 처리
  const { error: userErr } = await supabase
    .from("users")
    .delete()
    .eq("id", userId);

  if (userErr) {
    console.error("user delete error:", userErr);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const res = NextResponse.json({ success: true });
  clearAllCookies(res);
  return res;
}
