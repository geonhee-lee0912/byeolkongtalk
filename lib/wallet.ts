// /api/stars/balance 응답 → 화면이 쓰는 지갑 값(잔액·선물 미사용·반반 그룹). 표시·분기용 — 서버가 권위다.
import type { MenuArm } from "./tarot/menu-ab.ts";

export interface Wallet {
  balance: number;
  /** 별을 한 번도 쓴 적 없음 — 메뉴판 "선물로 무료" 조건 */
  giftUnused: boolean;
  /** 반반 비교 그룹 — 서버가 user_id 로 계산(lib/tarot/menu-ab.ts) */
  menuArm: MenuArm;
}

/** 응답 JSON → Wallet. 모양이 이상하면 안전한 쪽(잔액 0 · 선물 약속 없음 · 옛 그룹 = 지금 prod) */
export function parseWallet(d: unknown): Wallet {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  return {
    balance: typeof o.balance === "number" ? o.balance : 0,
    giftUnused: o.giftUnused === true,
    menuArm: o.menuArm === "menu" ? "menu" : "legacy",
  };
}

/** 지갑 조회 — 실패면 null(호출부가 안전한 기본값 parseWallet(null) 을 고른다) */
export async function fetchWallet(): Promise<Wallet | null> {
  try {
    const r = await fetch("/api/stars/balance", { cache: "no-store" });
    if (!r.ok) return null;
    return parseWallet(await r.json());
  } catch {
    return null;
  }
}
