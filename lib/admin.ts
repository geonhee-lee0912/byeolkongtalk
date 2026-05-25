// 어드민 권한 헬퍼.
// ADMIN_USER_IDS 환경변수에 콤마 구분으로 users.id (UUID) 들을 넣으면
// 그 유저들만 /admin 진입 가능. Phase 4 (d) 어드민 콘솔 활성화 전까지는
// 가드만 살아있고 사용처 없음 (setUserCookie 가 admin 토큰 발급은 이미 함).

import { cookies } from "next/headers";
import { verifyAdminToken } from "@/lib/auth-token";

const adminIdsRaw = process.env.ADMIN_USER_IDS ?? "";
const ADMIN_IDS = new Set(
  adminIdsRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const ADMIN_TOKEN_COOKIE = "byeolkong_admin_token";

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return ADMIN_IDS.has(userId.toLowerCase());
}

export function adminCount(): number {
  return ADMIN_IDS.size;
}

/**
 * 1차 화이트리스트 + 2차 HMAC 토큰 둘 다 검증. 둘 다 통과 못 하면 throw.
 */
export async function assertAdmin(
  userId: string | null | undefined
): Promise<void> {
  if (!isAdminUserId(userId)) {
    throw new AdminAccessError("not_in_whitelist");
  }
  const store = await cookies();
  const token = store.get(ADMIN_TOKEN_COOKIE)?.value;
  const tokenOk = await verifyAdminToken(userId, token);
  if (!tokenOk) {
    throw new AdminAccessError("admin_token_invalid");
  }
}

/**
 * boolean 반환 버전 (throw 없이). API 라우트에서 401/403 응답 분기용.
 */
export async function isAdminAuthorized(
  userId: string | null | undefined
): Promise<boolean> {
  if (!isAdminUserId(userId)) return false;
  const store = await cookies();
  const token = store.get(ADMIN_TOKEN_COOKIE)?.value;
  return verifyAdminToken(userId, token);
}

export class AdminAccessError extends Error {
  constructor(reason: string) {
    super(`Admin access denied: ${reason}`);
    this.name = "AdminAccessError";
  }
}
