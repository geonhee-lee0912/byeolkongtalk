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
 * 충전 시트 계측 → Meta CAPI `AddToCart` eventId (보내지 않으면 null).
 * 타로 광고 최적화 이벤트: 잔액 부족으로 "그 자리" 충전 시트가 열린 순간(위 source 전부).
 * /shop 진입("shop")은 둘러보기가 섞여 결제 연관이 약해(하루 내 결제 8.6% vs 25.1%, 2026-10-03 실측) 제외.
 * 유저·KST 날짜 단위 id — 같은 날 여러 번 열어도 Meta 가 1건으로 중복 제거한다.
 * meta.source 는 클라가 보낸 값이라 RECHARGE_SOURCE 값만 통과시킨다.
 */
export function rechargeCapiEventId(
  event: string,
  meta: unknown,
  userId: string | null,
  now: Date
): string | null {
  if (event !== "recharge_sheet_opened" || !userId) return null;
  const source = (meta as { source?: unknown } | null)?.source;
  if (!(Object.values(RECHARGE_SOURCE) as unknown[]).includes(source)) return null;
  return `atc:${userId}:${kstDate(now.toISOString())}`;
}
