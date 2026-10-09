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

/** 지갑 조회 제한 시간 — 보통 1초 안 · 콜드 스타트 2~3초. 그보다 길면 화면이 멈춘 것처럼 보이니 실패 경로로 떨어뜨린다.
 *  뽑기 화면의 "잠시만…" 덮개(탭을 막는다)는 이게 없으면 끌 방법이 없다. */
export const WALLET_TIMEOUT_MS = 5000;

/** 지갑을 읽는 지면 — wallet_fetch_failed 의 meta.source. ui_events 는 경로를 안 남겨 어느 화면의 실패인지 알 수 없고,
 *  지면마다 실패의 해로움이 다르다 — 그래서 호출부가 자기 라벨을 직접 단다.
 *  🔴 해로운 지면(실패하면 메뉴판 그룹 유저가 옛 화면·옛 가격·옛 진열을 보거나 버튼이 잠긴다): tarot_router · tarot_draw · recharge_sheet · shop · continuation_modal
 *     무해한 지면(실패하면 그 자리의 알약·카드가 안 뜰 뿐): home · reading_end · result
 *  감시 쿼리(scripts/menu-ab-daily-check.sql)의 wallet_fail 이 같은 두 목록을 쓴다 — 지면을 더하면 그쪽에도 같이 적을 것(wallet.test.ts 가 맞춰 본다). */
export type WalletSource =
  | "home"
  | "tarot_router"
  | "tarot_draw"
  | "recharge_sheet"
  | "shop"
  | "continuation_modal"
  | "reading_end"
  | "result";

/**
 * 지갑 조회 — 브라우저 전용(상대 URL). 서버는 menuArmOf(session.userId) 를 직접 쓴다.
 * 실패면 null(호출부가 안전한 기본값 parseWallet(null) 을 고른다). timeoutMs 안에 본문까지 못 읽으면 우리가 끊고 실패로 본다.
 * 🔴 실패하면 화면이 스위치가 정한 비로그인 그룹(반반 중엔 옛 그룹)으로 떨어지는데, 감시 쿼리(scripts/menu-ab-daily-check.sql)의 가격 대조는 서버 값끼리라
 *    이걸 못 잡는다 — wallet_fetch_failed 를 남겨 이 이벤트를 그룹(user_id 끝 글자)·지면(source)별로 센다.
 *    meta = { status, source }. source = 부른 지면(WalletSource).
 *    status = 응답을 받았으면 그 HTTP 상태(본문이 깨진 200 포함), fetch 자체가 던졌으면 "network",
 *    제한 시간에 걸려 우리가 끊었으면 "timeout"(본문을 읽다 끊긴 것 포함).
 *    제한은 AbortController + setTimeout — AbortSignal.timeout 은 구형 iOS Safari 에 없어 호출 자체가 던진다.
 */
export async function fetchWallet(source: WalletSource, timeoutMs: number = WALLET_TIMEOUT_MS): Promise<Wallet | null> {
  let status: number | "network" | "timeout" = "network";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch("/api/stars/balance", { cache: "no-store", signal: ctrl.signal });
    status = r.status;
    // 본문(r.json)도 try 안에서 기다린다 — 그래야 finally 의 clearTimeout 전까지 타이머가 본문 읽기까지 덮는다
    if (r.ok) return parseWallet(await r.json());
  } catch {
    // 연결 단절·본문 깨짐·시간 초과 — 아래에서 같이 계측하고 null 로 낸다
    if (ctrl.signal.aborted) status = "timeout"; // 우리가 끊은 것(응답 상태를 받은 뒤 본문에서 끊긴 것 포함)
  } finally {
    clearTimeout(timer);
  }
  trackUiEvent("wallet_fetch_failed", { meta: { status, source } });
  return null;
}
