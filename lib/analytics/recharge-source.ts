// 충전 시트 계측의 source 단일 원천.
//
// 🔴 'inchat' 은 건드리지 말 것 — scripts/roadmap-kpi-snapshot.sql 과
//    admin_roadmap_kpi RPC 가 meta->>'source' = 'inchat' 으로 명시 필터한다.
//    값을 바꾸면 기존 KPI 가 0 이 되고, 새 지면이 재사용하면 오염된다.
//    필터가 명시적이라 **새 값을 추가하는 것은 안전하다**(기존 집계에 안 섞인다).
export const RECHARGE_SOURCE = {
  inchat: "inchat",
  tarotDraw: "tarot_draw",
  fortunePurchase: "fortune_purchase",
  compat: "compat",
  tarotReport: "tarot_report",
} as const;

export type RechargeSource =
  (typeof RECHARGE_SOURCE)[keyof typeof RECHARGE_SOURCE];
