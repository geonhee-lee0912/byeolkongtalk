// 네이티브 로그인 — 카카오(카카오톡 앱, 없으면 카카오 계정)·애플(iOS). 서버 확인에 필요한 값만 돌려준다.
// 사용자가 취소하면 LoginCancelled — 화면은 조용히 그대로 둔다. 스펙 2026-10-12-앱-1 §7-3.
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { login as kakaoLogin } from "@react-native-seoul/kakao-login";
import type { AppleFullName } from "./session.ts";

export class LoginCancelled extends Error {}

function isKakaoCancel(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return code === "E_CANCELLED_OPERATION" || (typeof message === "string" && /cancel/i.test(message));
}

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
