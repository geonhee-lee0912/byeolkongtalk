// 별 차감 라우트.
// Phase 4 (c) 시점: amount 자체 상한 (1~100) + 로그인 검증만.
// Phase 5 readings 도입 후 readingId 소유권 + spread max cost 검증 보강 (아래 TODO).

import { NextRequest, NextResponse } from "next/server";
import { spendStars } from "@/lib/stars";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";

const AMOUNT_HARDCAP = 100; // 위조 amount 차단 — 도메인별 상세 max cost 는 Phase 5

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const amount = body?.amount;
    const readingId =
      typeof body?.readingId === "string" ? body.readingId : null;
    const source = typeof body?.source === "string" ? body.source : "reading";

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > AMOUNT_HARDCAP
    ) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    const cost = Math.floor(amount);

    // TODO (Phase 5): readingId 가 본인 소유인지 검증 + 도메인별 max cost 검증
    // 현재는 amount hardcap 만으로 위조 차단

    const result = await spendStars(userId, cost, { readingId, source });
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Insufficient stars",
          reason: result.reason,
          balance: result.balance,
        },
        { status: 402 }
      );
    }

    return NextResponse.json({
      success: true,
      balance: result.balance,
      transactionId: result.transactionId,
    });
  } catch (err) {
    await logError(
      err,
      ctxFromRequest(request, { route: "/api/stars/spend", userId })
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
