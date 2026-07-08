// Meta Conversions API — 서버 발화 전환 이벤트 (iOS/쿠키 차단 대응).
// Pixel(클라)은 PageView만, 전환(가입/체험완료/구매)은 여기서만 보내 중복을 원천 차단.
import { createHash } from "crypto";
import { waitUntil } from "@vercel/functions";
import { logError } from "./logger";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

type CapiEventName =
  | "CompleteRegistration" // 카카오 가입
  | "StartTrial" // 무료 리딩(체험) 완료
  | "Purchase"; // 별 충전 결제

type CapiEventParams = {
  eventName: CapiEventName;
  userId: string; // external_id 로 해시 전송
  eventId: string; // 멱등/중복제거 키 (예: reg:{userId}, purchase:{paymentId})
  value?: number; // Purchase 원화 금액
  fbp?: string | null; // _fbp 쿠키
  fbc?: string | null; // _fbc 쿠키
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string;
};

// fire-and-forget 호출용 — waitUntil 로 응답 반환 후에도 전송 완료까지 인스턴스 유지.
// (void sendCapiEvent(...) 만 하면 Vercel 이 함수를 얼리면서 소켓이 끊겨
//  TypeError: fetch failed + 전환 이벤트 유실이 발생)
export function sendCapiEvent(params: CapiEventParams): void {
  if (!PIXEL_ID || !ACCESS_TOKEN) return; // 미설정 시 no-op (dev 안전)
  waitUntil(deliverCapiEvent(params));
}

async function deliverCapiEvent(params: CapiEventParams): Promise<void> {
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
        // Meta 응답 지연 시 waitUntil 이 인스턴스를 오래 붙잡지 않도록 상한
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      await logError(new Error(`CAPI ${params.eventName} failed: ${text}`), {
        route: "lib/meta-capi",
        userId: params.userId,
        extra: { eventName: params.eventName, eventId: params.eventId },
      });
    }
  } catch (e) {
    await logError(e, {
      route: "lib/meta-capi",
      userId: params.userId,
      extra: { eventName: params.eventName, eventId: params.eventId },
    });
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
