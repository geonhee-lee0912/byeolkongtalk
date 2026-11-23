// 앱 결제 환불 → 별 회수 — 애플 REFUND 알림·구글 voidedPurchaseNotification 이 같은 함수로 거둔다. 스펙 2026-11-23-앱-결제 §4.
// 회수량 = 그 결제로 실제로 준 별(결제 별 충전 거래가 있을 때만 stars_given) + 그 결제에 붙은 첫충전 보너스(bonus_stars — 지급 성공 뒤에만 기록된다). 잔액이 모자라면 0 까지만 거두고 모자란 양을 남긴다(clawback_stars RPC).
// 같은 환불이 두 번 와도 한 번만: 결제가 이미 refunded 면 already, RPC 도 'clawback:<결제 id>' 로 멱등이다.
// 첫충전 보너스 수령 기록(bonus_claims)은 지우지 않는다 — 환불했다고 보너스를 다시 받지 않게.
// 실패(DB·회수)는 던진다 — 라우트가 logError 후 500 을 줘 스토어가 다시 보낸다. 다시 와도 회수는 멱등이라 안전하다.
import { getServiceSupabase } from "@/lib/supabase";
import { clawbackStars } from "@/lib/stars";
import { logWarn } from "@/lib/logger";

export type RefundResult = { kind: "clawed"; clawed: number; shortfall: number } | { kind: "already" } | { kind: "not_found" };

const ROUTE = "lib/payment/iap/refund";

export async function refundIapPayment(tid: string): Promise<RefundResult> {
  const supabase = getServiceSupabase();
  const { data: payment, error: lookupErr } = await supabase
    .from("payments")
    .select("id, user_id, stars_given, bonus_stars, status, stars_clawed_back")
    .eq("pg_tid", tid)
    .maybeSingle();
  if (lookupErr) throw new Error(`iap refund: payments lookup failed — ${lookupErr.message}`);
  if (!payment) return { kind: "not_found" };
  if (payment.status === "refunded") return { kind: "already" };

  const paymentId = payment.id as string;
  const userId = (payment.user_id as string | null) ?? null;
  const refundedAt = new Date().toISOString();

  // 탈퇴로 회원이 지워진 결제(익명 보존 행) — 거둘 잔액이 없다. 상태만
  if (userId === null) {
    await updatePayment(paymentId, { status: "refunded", refunded_at: refundedAt, stars_clawed_back: 0, clawback_shortfall: null });
    return { kind: "clawed", clawed: 0, shortfall: 0 };
  }

  // 결제 별은 충전 거래(charge_stars 가 남긴 type 'charge' 행)가 있을 때만 준 것이다 — charge_failed 로 멈춘 결제의 별을 다른 별에서 거두지 않게.
  // 남는 틈(첫 지급의 INSERT 와 chargeStars 사이 몇 ms 에 환불이 처리되는 경우)은 받아들인다 — 스토어 환불은 결제 한참 뒤에 오고, 완전히 막으려면 DB 함수로 묶어야 한다.
  const { data: chargeTx, error: txErr } = await supabase
    .from("star_transactions")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("type", "charge")
    .maybeSingle();
  if (txErr) throw new Error(`iap refund: star_transactions lookup failed — ${txErr.message}`);
  const amount = (chargeTx ? (payment.stars_given as number) : 0) + ((payment.bonus_stars as number | null) ?? 0);

  // 준 별이 없다 — 회수 RPC 는 0 을 거절하니 부르지 않고 상태만
  if (amount <= 0) {
    await updatePayment(paymentId, { status: "refunded", refunded_at: refundedAt, stars_clawed_back: 0, clawback_shortfall: 0 });
    return { kind: "clawed", clawed: 0, shortfall: 0 };
  }

  const claw = await clawbackStars(userId, amount, `clawback:${paymentId}`);
  if (!claw.success) throw new Error(`iap refund: clawback_stars failed (payment ${paymentId})`);

  // 앞 시도가 거둔 뒤 결제 행을 고치기 전에 죽었으면 RPC 가 멱등(idempotent)으로 그때 거둔 양을 돌려준다 —
  // 회수량이 비어 있을 때만 그 값으로 채우고, 이미 있으면 덮어쓰지 않는다
  const recordNumbers = !claw.idempotent || payment.stars_clawed_back == null;
  await updatePayment(paymentId, {
    status: "refunded",
    refunded_at: refundedAt,
    ...(recordNumbers ? { stars_clawed_back: claw.clawed, clawback_shortfall: claw.shortfall } : {}),
  });

  if (recordNumbers && claw.shortfall > 0) {
    // 설계된 신호 — 이미 쓴 별까지는 거둘 수 없다(AGENTS '운영 함정'의 정상 신호 목록). 회원 id 는 싣지 않는다
    await logWarn("iap refund shortfall", { route: ROUTE, extra: { paymentId, clawed: claw.clawed, shortfall: claw.shortfall } });
  }
  return { kind: "clawed", clawed: claw.clawed, shortfall: claw.shortfall };
}

async function updatePayment(paymentId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await getServiceSupabase().from("payments").update(fields).eq("id", paymentId);
  if (error) throw new Error(`iap refund: payments update failed (payment ${paymentId}) — ${error.message}`);
}
