// 별콩 운세 OG 이미지 — 카카오톡 공유 / 미리보기용. 1200×630.
// 사주 OG(app/api/og/saju) 구조를 미러링하되, 리포트 종류 무관 범용 카드:
// 운세 라벨 + 별콩이 한마디(note/summary/headline) + 워터마크.

import { ImageResponse } from "next/og";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";

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

/** 리포트 JSON 에서 카드에 쓸 한마디 추출 (종류 무관, 방어적). */
function extractFortuneLine(content: string): string {
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    const pick = (o.note ?? o.summary ?? o.headline ?? o.theme) as
      | string
      | undefined;
    if (typeof pick === "string" && pick.trim()) return pick.trim();
  } catch {
    /* JSON 아니면 무시 */
  }
  return "별콩이가 너의 흐름을 읽어줬어 ✨";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ readingId: string }> }
) {
  maybeSweepExpired();
  const rl = checkRateLimit({
    namespace: "og_fortune_ip",
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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      readingId
    )
  ) {
    return new Response("invalid_id", { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("emotion_tag, has_sensitive")
    .eq("id", readingId)
    .maybeSingle();

  if (!reading) return new Response("not_found", { status: 404 });
  if (reading.has_sensitive) return new Response("forbidden", { status: 403 });

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", readingId)
    .order("created_at", { ascending: true });

  const ft = fortuneTypeFromTag(reading.emotion_tag);
  const label = ft ? FORTUNE_CONFIG[ft].label : "별콩 운세";
  const content =
    (messages ?? []).find((m) => m.role === "assistant")?.content ?? "";
  const line = extractFortuneLine(content);

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
          <span style={{ color: "#E8C26A" }}>✨</span>
          <span>별콩 운세</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 68,
            color: "#F2D78A",
            marginTop: 30,
            marginBottom: 34,
          }}
        >
          {label}
        </div>

        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(232,194,106,0.25)",
            borderRadius: 20,
            padding: "28px 32px",
            fontSize: 30,
            lineHeight: 1.5,
            color: "#FFF8F0",
          }}
        >
          {line.length > 120 ? line.slice(0, 118) + "…" : line}
        </div>

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
          <span>별콩이의 운세 리포트</span>
          <span>byeolkongtalk.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Pretendard", data: font, weight: 700, style: "normal" }],
    }
  );
}
