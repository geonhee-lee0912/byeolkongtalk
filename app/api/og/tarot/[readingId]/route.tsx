// 타로 풀이 OG 이미지 — 카카오톡 공유 / 인스타 스토리 / 트위터 미리보기용.
// 기본 카카오/OG: 1200×630 가로. 인스타 스토리: 1080×1920 세로.
// 다크 그라데이션 + 뽑은 카드 이미지(sharp 리사이즈) + 별콩이 한마디(요약) + 워터마크.

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getServiceSupabase } from "@/lib/supabase";
import { extractClosingLine } from "@/lib/saju/closing";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { getCard } from "@/lib/tarot/cards";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import type { SpreadType, DrawnCard } from "@/lib/tarot/spreads";

export const runtime = "nodejs";

const FONT_BASE =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static";

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;
async function getFonts() {
  if (fontCache) return fontCache;
  const [regularRes, boldRes] = await Promise.all([
    fetch(`${FONT_BASE}/Pretendard-Regular.otf`),
    fetch(`${FONT_BASE}/Pretendard-Bold.otf`),
  ]);
  if (!regularRes.ok || !boldRes.ok) throw new Error("font fetch failed");
  const [regular, bold] = await Promise.all([
    regularRes.arrayBuffer(),
    boldRes.arrayBuffer(),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

// 카드 webp → sharp 리사이즈 → base64 jpeg (Satori 가 webp dataURL 불안정한 경우 대비)
const cardImgCache = new Map<number, string>();
async function getCardImageDataUrl(
  cardId: number,
  baseUrl: string,
  width = 320
): Promise<string | null> {
  if (cardImgCache.has(cardId)) return cardImgCache.get(cardId)!;
  try {
    const url = `${baseUrl}/cards-webp/${String(cardId).padStart(2, "0")}.webp`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`card fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf)
      .resize(width, null, { fit: "inside" })
      .jpeg({ quality: 82 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${resized.toString("base64")}`;
    cardImgCache.set(cardId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

const MARKER_RE = /\[CARD:\d+\]/g;

// 별 파티클 — 상대 좌표(0~1) × 캔버스 크기
const STAR_DOTS: { rx: number; ry: number; size: number; op: number; glow?: boolean }[] = [
  { rx: 0.08, ry: 0.08, size: 12, op: 0.9, glow: true },
  { rx: 0.9, ry: 0.14, size: 9, op: 0.8, glow: true },
  { rx: 0.05, ry: 0.4, size: 7, op: 0.6 },
  { rx: 0.94, ry: 0.5, size: 8, op: 0.65, glow: true },
  { rx: 0.12, ry: 0.62, size: 5, op: 0.5 },
  { rx: 0.88, ry: 0.78, size: 6, op: 0.6 },
  { rx: 0.2, ry: 0.9, size: 5, op: 0.5 },
  { rx: 0.7, ry: 0.92, size: 7, op: 0.55, glow: true },
  { rx: 0.5, ry: 0.06, size: 5, op: 0.45 },
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ readingId: string }> }
) {
  // Rate limit: ImageResponse CPU 보호 — IP당 분당 30건
  maybeSweepExpired();
  const rl = checkRateLimit({
    namespace: "og_tarot_ip",
    key: getClientIp(req),
    max: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return new Response("rate_limited", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const { readingId } = await params;
  const reqUrl = new URL(req.url);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || reqUrl.origin;
  const format = reqUrl.searchParams.get("format");
  // 인스타 스토리(세로 1080×1920) vs 기본 카카오/OG(가로 1200×630)
  const isStory = format === "instagram" || format === "story";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(readingId)) {
    return new Response("invalid_id", { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("spread_type, drawn_cards, question, consultation_type, has_sensitive")
    .eq("id", readingId)
    .maybeSingle();

  if (!reading || reading.consultation_type !== "tarot") {
    return new Response("not_found", { status: 404 });
  }
  if (reading.has_sensitive) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", readingId)
    .order("created_at", { ascending: true });

  const cleaned = (messages ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content:
      m.role === "assistant" ? m.content.replace(MARKER_RE, "") : m.content,
  }));
  const closingLine =
    extractClosingLine(cleaned, { excludeInvite: true }) ??
    "별콩이가 응원할게 ✨";
  const cards = ((reading.drawn_cards as DrawnCard[]) ?? []).slice(0, 5);
  const spreadLabel =
    SPREAD_INFO[reading.spread_type as SpreadType]?.label ?? "타로 풀이";

  const [fonts, cardImgs] = await Promise.all([
    getFonts(),
    Promise.all(cards.map((c) => getCardImageDataUrl(c.card_id, baseUrl))),
  ]);

  // ── 사이즈 산출 ──
  const W = isStory ? 1080 : 1200;
  const H = isStory ? 1920 : 630;
  const padding = isStory ? 90 : 60;
  const availW = W - padding * 2;
  const n = Math.max(cards.length, 1);
  const gap = isStory ? 26 : 14;
  const maxCardW = isStory ? 210 : 92;
  const cardW = Math.max(
    56,
    Math.min(maxCardW, Math.floor((availW - (n - 1) * gap) / n))
  );
  const cardH = Math.round(cardW * 1.5);
  const headerSize = isStory ? 36 : 22;
  const labelSize = isStory ? 24 : 14;
  const nameSize = isStory ? 26 : 15;
  const summarySize = isStory ? 38 : 22;
  const brandSize = isStory ? 28 : 16;
  const brandTitleSize = isStory ? 34 : 20;
  const gapHeaderToCards = isStory ? 64 : 18;
  const gapCardsToSummary = isStory ? 56 : 18;
  const closeCap = isStory ? 110 : 64;
  const trimmedClosing =
    closingLine.length > closeCap
      ? closingLine.slice(0, closeCap - 2) + "…"
      : closingLine;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #1F1735 0%, #2A1F4D 55%, #5A3E8C 100%)",
          padding: `${padding}px`,
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {/* 별 파티클 */}
        {STAR_DOTS.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: Math.round(s.ry * H),
              left: Math.round(s.rx * W),
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: "#E8C26A",
              opacity: s.op,
              ...(s.glow
                ? { boxShadow: `0 0 ${s.size * 2.2}px #E8C26A` }
                : {}),
            }}
          />
        ))}

        {/* 메인 — 세로 가운데 정렬 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* 헤더 pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: isStory ? "12px 28px" : "8px 20px",
              background: "rgba(232, 194, 106, 0.12)",
              border: "1px solid rgba(232, 194, 106, 0.4)",
              borderRadius: 999,
              fontSize: headerSize,
              color: "#F2D78A",
              marginBottom: gapHeaderToCards,
            }}
          >
            <span>🃏</span>
            <span>별콩이의 타로 풀이 · {spreadLabel}</span>
          </div>

          {/* 뽑은 카드 (실제 이미지) */}
          <div
            style={{
              display: "flex",
              gap,
              marginBottom: gapCardsToSummary,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {cards.map((c, i) => {
              const card = getCard(c.card_id);
              const img = cardImgs[i];
              const reversed = c.direction === "reversed";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    width: cardW,
                  }}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                    <img
                      src={img}
                      width={cardW}
                      height={cardH}
                      style={{
                        borderRadius: 14,
                        border: "2px solid rgba(232, 194, 106, 0.55)",
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
                        width: cardW,
                        height: cardH,
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(232,194,106,0.3)",
                        fontSize: labelSize,
                        color: "#F2D78A",
                      }}
                    >
                      {card?.name_kr ?? "?"}
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: labelSize,
                      color: "#F2D78A",
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {c.label}
                  </span>
                  <span
                    style={{
                      fontSize: nameSize,
                      color: "rgba(255,255,255,0.92)",
                      textAlign: "center",
                    }}
                  >
                    {card?.name_kr ?? ""}
                    {reversed ? " (역)" : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 별콩이 한마디 (요약) */}
          <div
            style={{
              display: "flex",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(232,194,106,0.25)",
              borderRadius: 20,
              padding: isStory ? "28px 36px" : "20px 28px",
              fontSize: summarySize,
              lineHeight: 1.5,
              color: "#FFF8F0",
              textAlign: "center",
              maxWidth: isStory ? "88%" : "78%",
            }}
          >
            “{trimmedClosing}”
          </div>
        </div>

        {/* 워터마크 (하단 고정) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: 0.7,
          }}
        >
          <span
            style={{ color: "#F2D78A", fontWeight: 700, fontSize: brandTitleSize }}
          >
            별콩톡 · 타로
          </span>
          <span style={{ fontSize: brandSize, color: "rgba(255,255,255,0.6)" }}>
            byeolkongtalk.com
          </span>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Pretendard", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Pretendard", data: fonts.bold, weight: 700, style: "normal" },
      ],
    }
  );
}
