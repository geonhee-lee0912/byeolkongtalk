// 별콩 운세 공유 카드용 OG 이미지 — 1200×630.
// 리포트 내용은 이미지에 넣지 않는다(길면 카카오 카드에서 잘림). 대신 내용 없는
// 범용 브랜드 카드(별콩 운세 워드마크 + 고정 태그라인)만 렌더 — 짧고 중앙 정렬이라
// 어떤 크롭에도 안 잘림. 실제 리포트 정보는 카카오 카드의 제목/설명 텍스트가 전달.
//
// readingId 는 URL 형식 검증만 하고 내용엔 쓰지 않는다(범용 이미지).

import { ImageResponse } from "next/og";
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
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {[
          { top: 90, left: 150, size: 10, op: 0.9 },
          { top: 140, left: 980, size: 7, op: 0.7 },
          { top: 80, left: 1080, size: 6, op: 0.8 },
          { top: 470, left: 120, size: 8, op: 0.7 },
          { top: 520, left: 1010, size: 7, op: 0.8 },
          { top: 300, left: 60, size: 5, op: 0.6 },
          { top: 340, left: 1140, size: 6, op: 0.7 },
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

        <div style={{ display: "flex", fontSize: 90, marginBottom: 12 }}>✨</div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            color: "#F2D78A",
            letterSpacing: 2,
          }}
        >
          별콩 운세
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            color: "#FFF8F0",
            opacity: 0.85,
            marginTop: 22,
          }}
        >
          별콩이가 너의 흐름을 읽어줄게
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 44,
            display: "flex",
            fontSize: 20,
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
