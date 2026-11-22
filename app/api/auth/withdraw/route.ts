// 회원 탈퇴 — 카카오 unlink + 본인 데이터 삭제 + 쿠키 정리.
//
// 🔴 회원 데이터 삭제는 users 삭제 한 문장이 전부다 — 나머지는 FK(CASCADE / SET NULL)가 같은 트랜잭션에서 처리한다.
// 새 표는 users FK 에 ON DELETE 를 쓰면 되고, 이 라우트에 표별 삭제를 더하지 않는다.

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession, clearAllCookies } from "@/lib/session";
import { unlinkKakao } from "@/lib/kakao";
import { logError, logInfo } from "@/lib/logger";

const DEADLOCK_DETECTED = "40P01";

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
  // 단 -101(이미 연결 없음 — 유저가 카카오 설정에서 직접 끊은 경우)은 링크가
  // 이미 없으므로 탈퇴 진행. 안 그러면 해당 유저는 영구 탈퇴 불가.
  const { data: userRow, error: lookupErr } = await supabase
    .from("users")
    .select("kakao_id")
    .eq("id", userId)
    .maybeSingle();
  // 조회 실패는 '행 없음'(연타·이미 삭제 — 그대로 진행)과 다르다. 연결을 못 끊은 채 지우면 좀비 OAuth 가 남는다
  if (lookupErr) {
    await logError(lookupErr, {
      route: "/api/auth/withdraw",
      userId,
      extra: { severity: "WITHDRAW_IDENTITY_LOOKUP_FAILED" },
    });
    return NextResponse.json(
      { error: "탈퇴 처리 중 문제가 생겼어. 잠시 후 다시 시도하거나 고객센터로 문의해줘" },
      { status: 503 }
    );
  }
  if (userRow?.kakao_id) {
    const unlink = await unlinkKakao(userRow.kakao_id);
    if (!unlink.ok && !unlink.alreadyUnlinked) {
      await logError(new Error("Kakao unlink failed during withdraw"), {
        route: "/api/auth/withdraw",
        userId,
        extra: {
          severity: "WITHDRAW_UNLINK_FAILED",
          kakaoStatus: unlink.status ?? null,
          kakaoCode: unlink.code ?? null,
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
    // 유저가 카카오 설정에서 직접 끊은 정상 시나리오 — 대응 불필요, 빈도 추적용 info
    if (unlink.alreadyUnlinked) {
      await logInfo("Kakao already unlinked before withdraw — proceeding", {
        route: "/api/auth/withdraw",
        userId,
        extra: { step: "kakao_unlink", kakaoCode: unlink.code ?? null },
      });
    }
  }

  // 탈퇴 이력 기록 — users 삭제 전에 kakao 해시로 append(재가입/탈퇴 횟수 집계용).
  // 실패해도 탈퇴는 계속 진행(best-effort) + 로그.
  if (userRow?.kakao_id) {
    const kakaoIdHash = createHash("sha256")
      .update(String(userRow.kakao_id))
      .digest("hex");
    // 유입 스냅샷 — users CASCADE 로 user_acquisition 이 사라지기 전에 복사 (소재별 탈퇴율 계측)
    const { data: acq } = await supabase
      .from("user_acquisition")
      .select(
        "utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_variant, referrer, first_seen_at"
      )
      .eq("user_id", userId)
      .maybeSingle();
    const { error: wErr, status: wStatus } = await supabase
      .from("account_withdrawals")
      .insert({ kakao_id_hash: kakaoIdHash, ...(acq ?? {}) });
    if (wErr) {
      // 원문엔 원장 해시가 실린다 — 이 로그는 탈퇴 뒤에도 남는다
      await logError(new Error(`withdrawal ledger insert failed (${wErr.code || `HTTP ${wStatus}`})`), {
        route: "/api/auth/withdraw",
        userId,
        extra: { severity: "WITHDRAWAL_LOG_FAILED", dbCode: wErr.code || null },
      });
    }
  }

  // users 삭제 — 별(star_balances·star_transactions)은 CASCADE, error_logs.user_id 는 SET NULL.
  // 별을 먼저 따로 지우지 말 것: 요청마다 따로 커밋되므로, 이 삭제가 실패하면 회원은 남고 충전한 별만 사라진다.
  const deleteUser = () => supabase.from("users").delete().eq("id", userId);
  let { error: userErr } = await deleteUser();
  // 별 RPC 는 잔액→users, 이 삭제는 users→잔액 순으로 잠가 같은 순간이면 교착이다.
  // 희생된 삭제는 통째로 롤백되고 그때 상대는 잠금을 얻어 끝나므로 한 번만 더 한다.
  if (userErr?.code === DEADLOCK_DETECTED) ({ error: userErr } = await deleteUser());

  if (userErr) {
    // 여기서 실패하면 unlink 만 끝난 반쪽 탈퇴 상태 — 재시도마다 -101 info 가 반복되므로
    // 어드민 에러 로그에 반드시 남겨서 원인(FK 등)을 추적 가능하게 한다.
    await logError(userErr, {
      route: "/api/auth/withdraw",
      userId,
      extra: {
        severity: "WITHDRAW_USER_DELETE_FAILED",
        dbCode: userErr.code ?? null,
      },
    });
    return NextResponse.json(
      {
        error:
          "탈퇴 처리 중 문제가 생겼어. 잠시 후 다시 시도하거나 고객센터로 문의해줘",
      },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ success: true });
  clearAllCookies(res);
  return res;
}
