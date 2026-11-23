// 네이티브 로그인 — 카카오(카카오톡 앱, 없으면 카카오 계정)·애플(iOS). 서버 확인에 필요한 값만 돌려준다.
// 사용자가 취소하면 LoginCancelled — 화면은 조용히 그대로 둔다. 스펙 2026-10-12-앱-1 §7-3.
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { login as kakaoLogin } from "@react-native-seoul/kakao-login";
import type { AppleFullName } from "./session.ts";

export class LoginCancelled extends Error {}

// 라이브러리(6.0.4)의 거절 code 는 늘 "RNKakaoLogins" 라 message 로 가른다. iOS 는 라이브러리가 사유 이름을 붙이고("ClientFailed(Cancelled): …"),
// 안드로이드는 카카오 SDK 오류의 message 그대로다(기본 문구가 영어·한국어 어느 쪽인지 확인 전 — Task 28 #2b).
// 카카오 계정 동의 화면의 '취소'는 Cancelled 가 아니라 access_denied 로 온다 — 설명 "User denied access"(카카오 문서의 로그인 취소 응답, iOS 는
// "AuthFailed(AccessDenied): User denied access"). 설명이 다른 access_denied 는 실패로 둔다
function isKakaoCancel(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return code === "E_CANCELLED_OPERATION" || (typeof message === "string" && /cancel|취소|user denied access/i.test(message));
}

/** 🔴 iOS 에서 카카오톡으로 넘어간 뒤 복귀 주소 없이 돌아오면(왼쪽 위 '◀ 별콩톡'·앱 전환) 카카오 SDK 가 끝을 알리지 않아 이 Promise 는
 *  영영 끝나지 않는다(KakaoSDKAuth 2.22.7 AuthController — 완료는 handleOpenUrl 로만). 부르는 쪽은 이 끝을 기다리는 잠금을 두지 않는다 */
export async function kakaoNativeLogin(): Promise<{ accessToken: string }> {
  try {
    const token = await kakaoLogin();
    return { accessToken: token.accessToken };
  } catch (e) {
    if (isKakaoCancel(e)) throw new LoginCancelled();
    throw e;
  }
}

/** 무작위 nonce 를 만들어 sha256(hex)을 애플에 넘기고 원본은 서버로 보낸다 — 서버가 sha256 해서 토큰의 nonce 와 대조한다 */
export async function appleNativeLogin(): Promise<{
  identityToken: string;
  authorizationCode: string;
  nonce: string;
  fullName: AppleFullName;
}> {
  const nonce = Crypto.randomUUID();
  const hashed = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce)).toLowerCase();
  try {
    const cred = await AppleAuthentication.signInAsync({
      // 이름만 — 이메일은 요청하지 않는다(우리는 이메일을 쓰지 않는다 · 수집 최소화, 스펙 §7-1)
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      nonce: hashed,
    });
    if (!cred.identityToken || !cred.authorizationCode) throw new Error("apple_missing_token");
    return {
      identityToken: cred.identityToken,
      authorizationCode: cred.authorizationCode,
      nonce,
      fullName: cred.fullName ? { givenName: cred.fullName.givenName, familyName: cred.fullName.familyName } : null,
    };
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "ERR_REQUEST_CANCELED") throw new LoginCancelled();
    throw e;
  }
}
