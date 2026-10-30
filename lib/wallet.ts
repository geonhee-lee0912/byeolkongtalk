// /api/stars/balance 응답 → 화면이 쓰는 지갑 값(잔액·게스트 여부·선물 미사용·입구 그룹). 표시·분기용 — 서버가 권위다.
import type { EntryArm } from "./tarot/entry-ab.ts";
import { trackUiEvent } from "./analytics/ui-events.ts";

export interface Wallet {
  balance: number;
  /** 비로그인 여부 */
  isGuest: boolean;
  /** 가입 선물을 받았고 아직 별을 한 번도 안 씀 */
  giftUnused: boolean;
  /** 입구 반반 그룹 — 서버가 익명 쿠키로 계산(lib/tarot/entry-ab.ts). 비로그인만 의미 있다. 회원·모름 = "old" */
  entryArm: EntryArm;
}

/** 응답 JSON → Wallet. 모양이 이상하면 잔액 0 · 게스트 · 선물 약속 없음으로 처리한다. */
export function parseWallet(d: unknown): Wallet {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  return {
    balance: typeof o.balance === "number" ? o.balance : 0,
    isGuest: o.isGuest !== false, // 모르면 게스트 = 약속하지 않는 쪽
    giftUnused: o.giftUnused === true,
    // 모르는 값·누락(배포 순간 옛 서버 응답)은 old — 새 흐름은 서버가 "new" 를 명시할 때만 켜진다. 회원은 서버가 늘 "old" 를 준다(app/api/stars/balance)
    entryArm: o.entryArm === "new" ? "new" : "old",
  };
}

/** 지갑 조회 제한 시간 — 보통 1초 안 · 콜드 스타트 2~3초. 그보다 길면 화면이 멈춘 것처럼 보이니 실패 경로로 떨어뜨린다.
 *  뽑기 화면의 "잠시만…" 덮개(탭을 막는다)는 이게 없으면 끌 방법이 없다. */
export const WALLET_TIMEOUT_MS = 5000;

/** 지갑을 읽는 지면 — wallet_fetch_failed 의 meta.source. ui_events 는 경로를 안 남겨 어느 화면의 실패인지 알 수 없다.
 *  그래서 호출부가 자기 라벨을 직접 단다(wallet.test.ts 가 지면마다 자기 라벨인지 소스로 본다). */
export type WalletSource =
  | "home"
  | "tarot_router"
  | "tarot_draw"
  | "recharge_sheet"
  | "shop"
  | "continuation_modal";

/**
 * 지갑 조회 — 브라우저 전용(상대 URL).
 * 실패면 null(호출부가 안전한 기본값 parseWallet(null) 을 고른다). timeoutMs 안에 본문까지 못 읽으면 우리가 끊고 실패로 본다.
 * wallet_fetch_failed 를 남겨 이 이벤트를 지면(source)별로 센다.
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
