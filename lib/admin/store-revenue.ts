// 스토어(애플/구글) 매출 표 계산 — admin_store_revenue RPC 행 → 표 줄. 순수 함수.
// 수수료율은 추정치(소규모 사업자 프로그램 가정) 한 곳에만 둔다.
export const STORE_FEE_RATE = 0.15;

export type StoreRevenueRpcRow = {
  provider: string;
  payments: number | string;
  gross_won: number | string;
  refunded: number | string;
  refunded_won: number | string;
  shortfall_stars: number | string;
};

export type StoreRevenueLine = {
  label: string;
  payments: number;
  gross: number;
  fee: number;
  net: number;
  refunded: number;
  refundedWon: number;
  shortfallStars: number;
};

const LABELS: Record<string, string> = { apple: "애플", google: "구글" };

// gross 는 완료+환불 전체. 스토어는 환불 때 수수료도 돌려주므로 수수료는 (gross - 환불액) 기준.
function line(label: string, v: Omit<StoreRevenueLine, "label" | "fee" | "net">): StoreRevenueLine {
  const fee = Math.round((v.gross - v.refundedWon) * STORE_FEE_RATE);
  return { label, ...v, fee, net: v.gross - v.refundedWon - fee };
}

export function storeRevenueRows(rpcRows: StoreRevenueRpcRow[]): { rows: StoreRevenueLine[]; total: StoreRevenueLine } {
  const rows = rpcRows.map((r) =>
    line(LABELS[r.provider] ?? r.provider, {
      payments: Number(r.payments),
      gross: Number(r.gross_won),
      refunded: Number(r.refunded),
      refundedWon: Number(r.refunded_won),
      shortfallStars: Number(r.shortfall_stars),
    }),
  );
  const sum = (k: "payments" | "gross" | "refunded" | "refundedWon" | "shortfallStars") =>
    rows.reduce((a, r) => a + r[k], 0);
  const total = line("합계", {
    payments: sum("payments"), gross: sum("gross"), refunded: sum("refunded"),
    refundedWon: sum("refundedWon"), shortfallStars: sum("shortfallStars"),
  });
  return { rows, total };
}
