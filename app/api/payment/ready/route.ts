import { NextRequest, NextResponse } from "next/server";
import { generateOrderId } from "@/lib/toss";
import { getSession } from "@/lib/session";
import { STAR_PACKAGES } from "@/lib/constants";

/**
 * 결제 준비: orderId 생성 및 패키지 검증
 * 프론트엔드에서 토스 SDK requestPaymentWindow() 호출 전에 사용
 * 게스트는 결제 불가 — 카카오 로그인 강제
 */
export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required to charge stars" },
      { status: 401 }
    );
  }

  try {
    const { packageType, stars, amount } = await request.json();

    const pkg = STAR_PACKAGES.find((p) => p.id === packageType);
    if (!pkg || pkg.stars !== stars || pkg.price !== amount) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const orderId = generateOrderId(userId, packageType);

    return NextResponse.json({
      orderId,
      orderName: `별콩톡 ${pkg.label}`,
      amount: pkg.price,
      starsGiven: pkg.stars,
      packageType: pkg.id,
    });
  } catch (error) {
    console.error("Payment ready error:", error);
    return NextResponse.json(
      { error: "Payment preparation failed" },
      { status: 500 }
    );
  }
}
