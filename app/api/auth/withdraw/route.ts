// 회원 탈퇴 — 로그인 수단별 연결 끊기(카카오 unlink · 애플 revoke) + 본인 데이터 삭제 + 쿠키 정리.
//
// Phase 4 (b) 시점엔 stars/readings/payments 테이블이 없어서 users 만 삭제.
// 추후 테이블 추가될 때마다 이 라우트에 삭제 단계 보강 필요:
//   Phase 4 (c): star_balances, star_transactions, payments
//   Phase 5: readings (transaction_id 순환 FK 끊기), messages (CASCADE)
// 로그인 수단(user_identities)·앱 토큰(app_refresh_tokens·app_handoff_codes)은 users ON DELETE CASCADE 로 함께 지워진다.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession, clearAllCookies } from "@/lib/session";
import { unlinkKakao } from "@/lib/kakao";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { getUserIdentities, primaryIdentity, type UserIdentity } from "@/lib/auth/user-identity";
import { identityHash } from "@/lib/auth/identity-hash";
import { decryptSecret } from "@/lib/auth/token-crypto";
import { revokeAppleToken } from "@/lib/auth/apple";

const ROUTE = "/api/auth/withdraw";

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

  // 로그인 수단 조회 — 실패하면 멈춘다(연결을 못 끊은 채 지우면 좀비 OAuth 가 남는다)
  let identities: UserIdentity[];
  try {
    identities = await getUserIdentities(userId);
  } catch (err) {
    await logError(err, { route: ROUTE, userId, extra: { severity: "WITHDRAW_IDENTITY_LOOKUP_FAILED" } });
    return NextResponse.json(
      { error: "탈퇴 처리 중 문제가 생겼어. 잠시 후 다시 시도하거나 고객센터로 문의해줘" },
      { status: 503 }
    );
  }

  for (const ident of identities) {
    if (ident.provider === "kakao") {
      // 카카오 unlink. 실패 시 503 + DB 삭제 중단 (좀비 OAuth 방지)
      // 단 -101(이미 연결 없음 — 유저가 카카오 설정에서 직접 끊은 경우)은 링크가
      // 이미 없으므로 탈퇴 진행. 안 그러면 해당 유저는 영구 탈퇴 불가.
      const unlink = await unlinkKakao(ident.providerUserId);
      if (!unlink.ok && !unlink.alreadyUnlinked) {
        await logError(new Error("Kakao unlink failed during withdraw"), {
          route: ROUTE,
          userId,
          extra: {
            kakaoId: ident.providerUserId,
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
          route: ROUTE,
          userId,
          extra: { kakaoId: ident.providerUserId },
        });
      }
    } else if (ident.provider === "apple") {
      // 애플 revoke(애플 지침 5.1.1(v)). 토큰이 있는데 실패하면 카카오처럼 멈춘다.
      // 토큰이 없으면(가입 때 인가 코드 교환이 실패한 경우) 회수할 게 없다 — 경고만 남기고 진행.
      // 탈퇴가 끝나면 이 경고의 user_id 는 NULL 이 된다(error_logs FK SET NULL) — 남는 단서는 extra 뿐이다
      if (!ident.appleRefreshTokenEnc || !ident.appleClientId) {
        await logWarn("Apple refresh token missing at withdraw — proceeding without revoke", {
          route: ROUTE,
          userId,
          extra: {
            appleClientId: ident.appleClientId,
            reason: ident.appleRefreshTokenEnc ? "no_client_id" : "no_token",
          },
        });
        continue;
      }
      let revoked = false;
      let refreshToken: string | null = null;
      try {
        refreshToken = decryptSecret(ident.appleRefreshTokenEnc);
      } catch (err) {
        // 키 설정 오류(env 누락·길이) 또는 키가 바뀌어 못 푸는 토큰 — 애플 쪽 실패와 구분해 남긴다
        await logError(err, { route: ROUTE, userId, extra: { step: "apple_decrypt" } });
      }
      if (refreshToken) {
        try {
          await revokeAppleToken(refreshToken, ident.appleClientId); // 실패면 상태·error 코드를 실어 throw
          revoked = true;
        } catch (err) {
          await logError(err, { route: ROUTE, userId, extra: { step: "apple_revoke" } });
        }
      }
      if (!revoked) {
        await logError(new Error("Apple revoke failed during withdraw"), {
          route: ROUTE,
          userId,
          extra: { severity: "WITHDRAW_APPLE_REVOKE_FAILED" },
        });
        return NextResponse.json(
          {
            error:
              "애플 연결 해제에 실패했어. 잠시 후 다시 시도하거나 고객센터로 문의해줘",
          },
          { status: 503 }
        );
      }
    } else {
      // 끊는 법을 모르는 수단 — 연결을 남긴 채 회원을 지우지 않는다.
      // 수단을 늘리면 여기서 컴파일 에러가 난다(identity-hash.ts 와 같은 장치 — 그쪽만 고치면 빌드가 통과하고 새 수단은 끊기지 않은 채 지워진다)
      const unknown: never = ident.provider;
      await logError(new Error(`unknown auth provider at withdraw: ${String(unknown)}`), {
        route: ROUTE,
        userId,
        extra: { severity: "WITHDRAW_UNKNOWN_PROVIDER" },
      });
      return NextResponse.json(
        { error: "탈퇴 처리 중 문제가 생겼어. 잠시 후 다시 시도하거나 고객센터로 문의해줘" },
        { status: 503 }
      );
    }
  }

  // 탈퇴 이력 기록 — users 삭제 전에 로그인 수단 해시로 append(재가입/탈퇴 횟수 집계용).
  // 실패해도 탈퇴는 계속 진행(best-effort) + 로그.
  const primary = primaryIdentity(identities);
  if (primary) {
    const hash = identityHash(primary.provider, primary.providerUserId);
    // 유입 스냅샷 — users CASCADE 로 user_acquisition 이 사라지기 전에 복사 (소재별 탈퇴율 계측)
    const { data: acq } = await supabase
      .from("user_acquisition")
      .select(
        "utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_variant, referrer, first_seen_at"
      )
      .eq("user_id", userId)
      .maybeSingle();
    const { error: wErr } = await supabase
      .from("account_withdrawals")
      .insert({ kakao_id_hash: hash, ...(acq ?? {}) });
    if (wErr) {
      await logError(wErr, {
        route: ROUTE,
        userId,
        extra: { severity: "WITHDRAWAL_LOG_FAILED" },
      });
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
    // 여기서 실패하면 unlink 만 끝난 반쪽 탈퇴 상태 — 재시도마다 -101 info 가 반복되므로
    // 어드민 에러 로그에 반드시 남겨서 원인(FK 등)을 추적 가능하게 한다.
    await logError(userErr, {
      route: ROUTE,
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
