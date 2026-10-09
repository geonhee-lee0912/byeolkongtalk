// /api/stars/balance 응답 → 화면이 쓰는 지갑 값(잔액·게스트 여부·선물 미사용·반반 그룹). 표시·분기용 — 서버가 권위다.
import { menuArmOf, type MenuArm } from "./tarot/menu-ab.ts";
import { trackUiEvent } from "./analytics/ui-events.ts";

export interface Wallet {
  balance: number;
  /** 비로그인 — 그룹을 모른다(홈 한 줄 등은 로그인 유저만) */
  isGuest: boolean;
  /** 가입 선물을 받았고 아직 별을 한 번도 안 씀 — 메뉴판 "선물로 무료" 조건 */
  giftUnused: boolean;
  /** 반반 비교 그룹 — 서버가 user_id 로 계산(lib/tarot/menu-ab.ts) */
  menuArm: MenuArm;
}

/** 응답 JSON → Wallet. 모양이 이상하면 안전한 쪽(잔액 0 · 게스트 · 선물 약속 없음 · 스위치가 정한 비로그인 그룹 — 반반 중엔 옛 그룹 = 지금 prod).
 *  그룹은 응답에 유효한 값("menu"|"legacy")이 있으면 그대로 둔다. 폴백만 menuArmOf(null) 이라, 판정 뒤 MENU_AB 를 돌려도(정리 배포 전까지)
 *  조회 실패가 진 쪽 진열을 되살리지 않는다 */
export function parseWallet(d: unknown): Wallet {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const arm = o.menuArm;
  return {
    balance: typeof o.balance === "number" ? o.balance : 0,
    isGuest: o.isGuest !== false, // 모르면 게스트 = 약속하지 않는 쪽
    giftUnused: o.giftUnused === true,
    menuArm: arm === "menu" || arm === "legacy" ? arm : menuArmOf(null),
  };
}

/**
 * 지갑 조회 — 브라우저 전용(상대 URL). 서버는 menuArmOf(session.userId) 를 직접 쓴다.
 * 실패면 null(호출부가 안전한 기본값 parseWallet(null) 을 고른다).
 * 🔴 실패하면 화면이 스위치가 정한 비로그인 그룹(반반 중엔 옛 그룹)으로 떨어지는데, 감시 쿼리(scripts/menu-ab-daily-check.sql)의 가격 대조는 서버 값끼리라
 *    이걸 못 잡는다 — wallet_fetch_failed 를 남겨 이 이벤트를 그룹(user_id 끝 글자)별로 센다.
 *    status = 응답을 받았으면 그 HTTP 상태(본문이 깨진 200 포함), fetch 자체가 던졌으면 "network".
 */
export async function fetchWallet(): Promise<Wallet | null> {
  let status: number | "network" = "network";
  try {
    const r = await fetch("/api/stars/balance", { cache: "no-store" });
    status = r.status;
    if (r.ok) return parseWallet(await r.json());
  } catch {
    // 연결 단절·본문 깨짐 — 아래에서 같이 계측하고 null 로 낸다
  }
  trackUiEvent("wallet_fetch_failed", { meta: { status } });
  return null;
}
