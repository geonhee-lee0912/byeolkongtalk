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
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background:
            "linear-gradient(135deg, #1F1735 0%, #2A1F4D 55%, #5A3E8C 100%)",
          padding: "70px 60px",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {/* 카카오 피드 카드가 좌우를 크롭하므로 모든 텍스트를 중앙 세이프존(폭 760)에 모은다 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontSize: 24,
            opacity: 0.75,
            marginBottom: 24,
          }}
        >
          <span style={{ color: "#E8C26A" }}>✨</span>
          <span>별콩 운세</span>
        </div>

        <div
          style={{
            display: "flex",
            textAlign: "center",
            fontSize: 60,
            lineHeight: 1.2,
            color: "#F2D78A",
            maxWidth: 760,
            marginBottom: 30,
          }}
        >
          {label.length > 22 ? label.slice(0, 21) + "…" : label}
        </div>

        <div
          style={{
            display: "flex",
            textAlign: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(232,194,106,0.25)",
            borderRadius: 20,
            padding: "26px 30px",
            fontSize: 29,
            lineHeight: 1.5,
            color: "#FFF8F0",
            maxWidth: 760,
          }}
        >
          {line.length > 80 ? line.slice(0, 78) + "…" : line}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            fontSize: 18,
            opacity: 0.55,
          }}
        >
          byeolkongtalk.com
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
