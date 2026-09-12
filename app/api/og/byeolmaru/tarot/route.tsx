// 오늘의 타로 OG 이미지 — 별마루 공유용. 1200×630.
// 무상태: readings 가 아니라 룰 결과라 세션·DB·PII 0 — 카드·역위 여부를 URL 파라미터로만 받아 렌더.
// (has_sensitive 무관 — 오늘의 카드는 상담이 아니라 룰 드로우)
import { ImageResponse } from "next/og";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { getCard } from "@/lib/tarot/cards";
import { getCardImageDataUrl } from "@/lib/og/card-image";

export const runtime = "nodejs";

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf";

let fontCache: ArrayBuffer | null = null;
async function getFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  fontCache = await res.arrayBuffer();
  return fontCache;
}

export async function GET(req: Request) {
  maybeSweepExpired();
  const rl = checkRateLimit({ namespace: "og_byeolmaru_tarot_ip", key: getClientIp(req), max: 30, windowMs: 60_000 });
  if (!rl.ok) return new Response("rate_limited", { status: 429, headers: { "Retry-After": "60" } });

  const url = new URL(req.url);
  const cardRaw = url.searchParams.get("card");
  const revRaw = url.searchParams.get("rev");

  if (!cardRaw || !/^\d+$/.test(cardRaw)) return new Response("invalid", { status: 400 });
  const cardId = Number(cardRaw);
  if (!Number.isInteger(cardId) || cardId < 0 || cardId > 77) {
    return new Response("invalid", { status: 400 });
  }
  if (revRaw !== "0" && revRaw !== "1") return new Response("invalid", { status: 400 });
  const reversed = revRaw === "1";

  const card = getCard(cardId);
  if (!card) return new Response("invalid", { status: 400 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || url.origin;
  const keywords = (reversed ? card.reversed : card.upright).join(", ");

  const [font, cardImg] = await Promise.all([getFont(), getCardImageDataUrl(cardId, baseUrl, 320)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1F1735 0%, #2A1F4D 55%, #5A3E8C 100%)",
          padding: "56px 70px",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {[
          { top: 70, left: 120, size: 8, op: 0.9 },
          { top: 150, left: 980, size: 6, op: 0.7 },
          { top: 90, left: 1080, size: 5, op: 0.8 },
          { top: 470, left: 80, size: 6, op: 0.7 },
          { top: 520, left: 1100, size: 7, op: 0.8 },
        ].map((s, i) => (
          <div
            key={i}
            style={{ position: "absolute", top: s.top, left: s.left, width: s.size, height: s.size, borderRadius: "50%", background: "#E8C26A", opacity: s.op }}
          />
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, opacity: 0.7 }}>
          <span style={{ color: "#E8C26A" }}>🃏</span>
          <span>별콩톡 오늘의 카드</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {cardImg ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={cardImg}
              width={220}
              height={330}
              style={{
                borderRadius: 16,
                border: "2px solid rgba(232,194,106,0.55)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                ...(reversed ? { transform: "rotate(180deg)" } : {}),
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 220,
                height: 330,
                borderRadius: 16,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(232,194,106,0.3)",
                fontSize: 22,
                color: "#F2D78A",
                textAlign: "center",
                padding: 20,
              }}
            >
              {card.name_kr}
            </div>
          )}

          <div style={{ display: "flex", fontSize: 40, color: "#F2D78A", fontWeight: 700, marginTop: 28 }}>
            {card.name_kr}
            <span style={{ opacity: 0.75, marginLeft: 12 }}>({reversed ? "역위" : "정위"})</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.85)", marginTop: 16, maxWidth: 760, textAlign: "center" }}>
            {keywords}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", fontSize: 20, opacity: 0.6 }}>
          <span>byeolkongtalk.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Pretendard", data: font, weight: 700, style: "normal" }],
    },
  );
}
