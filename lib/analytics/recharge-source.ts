// 충전 시트 계측의 source 단일 원천.
//
// 🔴 'inchat' 은 건드리지 말 것 — scripts/roadmap-kpi-snapshot.sql 과
//    admin_roadmap_kpi RPC 가 meta->>'source' = 'inchat' 으로 명시 필터한다.
//    값을 바꾸면 기존 KPI 가 0 이 되고, 새 지면이 재사용하면 오염된다.
//    필터가 명시적이라 **새 값을 추가하는 것은 안전하다**(기존 집계에 안 섞인다).
import { kstDate } from "../admin-time.ts";

export const RECHARGE_SOURCE = {
  inchat: "inchat",
  tarotDraw: "tarot_draw",
  fortunePurchase: "fortune_purchase",
  compat: "compat",
  tarotReport: "tarot_report",
} as const;

export type RechargeSource =
  (typeof RECHARGE_SOURCE)[keyof typeof RECHARGE_SOURCE];

/**
 * 결제 퍼널 계측 → Meta CAPI `AddToCart` eventId (보내지 않으면 null).
 * 타로 광고 최적화 이벤트. 두 이벤트가 같은 id 를 낸다:
 * - `paywall_shown` — 잔액 부족 확인 모달(StarConfirmModal insufficient) 노출. **2026-10-04 부터 주 원천.**
 *   meta 내용은 보지 않는다(surface 무관) — 모달 자체가 "결제 아니면 못 간다"를 본 순간이다.
 * - `recharge_sheet_opened`(source ∈ RECHARGE_SOURCE) — 잔액 부족으로 "그 자리" 충전 시트가 열린 순간.
 *   2026-10-03~04 의 원래 정의. 실발화가 하루 1~2건이라 Meta 학습 요건(주 50건)에 못 미쳐 위로 당겼다.
 *   /shop 진입("shop")은 둘러보기가 섞여 결제 연관이 약해(하루 내 결제 8.6% vs 25.1%, 2026-10-03 실측) 여전히 제외.
 * 유저·KST 날짜 단위 id — 같은 날 모달을 보고 시트까지 열어도 Meta 가 1건으로 중복 제거한다.
 * meta.source 는 클라가 보낸 값이라 RECHARGE_SOURCE 값만 통과시킨다.
 */
export function rechargeCapiEventId(
  event: string,
  meta: unknown,
  userId: string | null,
  now: Date
): string | null {
  if (!userId) return null;
  if (event === "recharge_sheet_opened") {
    const source = (meta as { source?: unknown } | null)?.source;
    if (!(Object.values(RECHARGE_SOURCE) as unknown[]).includes(source)) return null;
  } else if (event !== "paywall_shown") {
    return null;
  }
  return `atc:${userId}:${kstDate(now.toISOString())}`;
}
