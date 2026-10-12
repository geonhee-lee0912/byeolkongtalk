// 로그인 수단 해시 — 웰컴·첫충전 보너스 중복 방지(bonus_claims)와 재가입 추적(account_withdrawals)의 단일 원천.
// 🔴 카카오 공식은 바꾸면 안 된다: 원장이 sha256(String(kakao_id)) 로 쌓여 있다.
//    바꾸면 탈퇴→재가입한 사람이 웰컴 별을 또 받는다. 애플은 카카오 값과 겹치지 않게 접두를 붙인다.
// 순수 함수(next·supabase 의존 없음) — 라우트·어드민·테스트가 같이 쓴다.
import { createHash } from "node:crypto";

export type AuthProvider = "kakao" | "apple";

export function identityHash(provider: AuthProvider, providerUserId: string | number): string {
  const raw = provider === "kakao" ? String(providerUserId) : `apple:${providerUserId}`;
  return createHash("sha256").update(raw).digest("hex");
}
