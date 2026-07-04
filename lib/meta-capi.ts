// Meta Conversions API — 서버 발화 전환 이벤트 (iOS/쿠키 차단 대응).
// Pixel(클라)은 PageView만, 전환(가입/체험완료/구매)은 여기서만 보내 중복을 원천 차단.
import { createHash } from "crypto";
import { logError } from "./logger";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

type CapiEventName =
  | "CompleteRegistration" // 카카오 가입
  | "StartTrial" // 무료 리딩(체험) 완료
  | "Purchase"; // 별 충전 결제

export async function sendCapiEvent(params: {
  eventName: CapiEventName;
  userId: string; // external_id 로 해시 전송
  eventId: string; // 멱등/중복제거 키 (예: reg:{userId}, purchase:{paymentId})
  value?: number; // Purchase 원화 금액
  fbp?: string | null; // _fbp 쿠키
  fbc?: string | null; // _fbc 쿠키
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string;
}): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return; // 미설정 시 no-op (dev 안전)
  try {
    const body = {
      data: [
        {
          event_name: params.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.eventId,
          action_source: "website",
          event_source_url: params.sourceUrl ?? "https://byeolkongtalk.com",
          user_data: {
            external_id: [
              createHash("sha256").update(params.userId).digest("hex"),
            ],
            ...(params.fbp ? { fbp: params.fbp } : {}),
            ...(params.fbc ? { fbc: params.fbc } : {}),
            ...(params.clientIp ? { client_ip_address: params.clientIp } : {}),
            ...(params.userAgent ? { client_user_agent: params.userAgent } : {}),
          },
          ...(params.eventName === "Purchase"
            ? { custom_data: { currency: "KRW", value: params.value ?? 0 } }
            : {}),
        },
      ],
    };
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      await logError(new Error(`CAPI ${params.eventName} failed: ${text}`), {
        route: "lib/meta-capi",
        userId: params.userId,
      });
    }
  } catch (e) {
    await logError(e, { route: "lib/meta-capi", userId: params.userId });
  }
}

/** 요청에서 CAPI 매칭용 신호 추출 (fbp/fbc 쿠키 + IP + UA) */
export function capiSignalsFromRequest(request: Request): {
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  userAgent: string | null;
} {
  const cookie = request.headers.get("cookie") ?? "";
  const pick = (name: string) =>
    cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;
  return {
    fbp: pick("_fbp"),
    fbc: pick("_fbc"),
    clientIp:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  };
}
