// 타로 풀이 OG 이미지 — 카카오톡 공유 / 트위터 등 미리보기용.
// 1200×630 (카카오 권장 비율). 다크 그라데이션 + 뽑은 카드 + 별콩이 한마디 + 워터마크.
// 사주 OG 와 동일 톤, 4기둥 대신 뽑은 카드 카드명/포지션 노출 (카드 이미지는 생략 — sharp 미설치).

import { ImageResponse } from "next/og";
import { getServiceSupabase } from "@/lib/supabase";
import { extractClosingLine } from "@/lib/saju/closing";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { getCard } from "@/lib/tarot/cards";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import type { SpreadType, DrawnCard } from "@/lib/tarot/spreads";

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

const MARKER_RE = /\[CARD:\d+\]/g;

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
      m.role === "assistant"
        ? m.content.replace(MARKER_RE, "")
        : m.content,
  }));
  const closingLine = extractClosingLine(cleaned) ?? "별콩이가 응원할게 ✨";
  const cards = (reading.drawn_cards as DrawnCard[]) ?? [];
  const spreadLabel =
    SPREAD_INFO[reading.spread_type as SpreadType]?.label ?? "타로 풀이";

  const font = await getFont();

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
          padding: "60px 70px",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {[
          { top: 60, left: 110, size: 8, op: 0.9 },
          { top: 130, left: 880, size: 6, op: 0.7 },
          { top: 80, left: 1050, size: 5, op: 0.8 },
          { top: 240, left: 60, size: 4, op: 0.6 },
          { top: 380, left: 1130, size: 7, op: 0.85 },
          { top: 510, left: 90, size: 5, op: 0.7 },
          { top: 540, left: 1080, size: 6, op: 0.75 },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: "#E8C26A",
              opacity: s.op,
            }}
          />
        ))}

        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 22,
            opacity: 0.7,
            marginBottom: 10,
          }}
        >
          <span style={{ color: "#E8C26A" }}>🃏</span>
          <span>별콩이의 타로 풀이 · {spreadLabel}</span>
        </div>

        {/* 뽑은 카드 */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 30,
            marginBottom: 30,
            justifyContent: "center",
          }}
        >
          {cards.slice(0, 5).map((c, i) => {
            const card = getCard(c.card_id);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    width: 130,
                    height: 180,
                    padding: "12px",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    border: "1px solid rgba(232,194,106,0.3)",
                    fontSize: 22,
                    color: "#F2D78A",
                    lineHeight: 1.3,
                  }}
                >
                  {card?.name_kr ?? "?"}
                  {c.direction === "reversed" ? " (역)" : ""}
                </div>
                <div style={{ fontSize: 15, opacity: 0.7 }}>{c.label}</div>
              </div>
            );
          })}
        </div>

        {/* 마무리 한마디 */}
        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(232,194,106,0.25)",
            borderRadius: 20,
            padding: "24px 28px",
            fontSize: 26,
            lineHeight: 1.5,
            color: "#FFF8F0",
          }}
        >
          {closingLine.length > 110
            ? closingLine.slice(0, 108) + "…"
            : closingLine}
        </div>

        {/* 워터마크 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: 24,
            fontSize: 18,
            opacity: 0.6,
          }}
        >
          <span>{spreadLabel}</span>
          <span>byeolkongtalk.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Pretendard",
          data: font,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );
}
