import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "별콩톡 - 사주와 타로로 고민을 나누는 친구";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_BOLD =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf";
const FONT_REGULAR =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf";

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const [regularRes, boldRes] = await Promise.all([
    fetch(FONT_REGULAR),
    fetch(FONT_BOLD),
  ]);
  fontCache = {
    regular: await regularRes.arrayBuffer(),
    bold: await boldRes.arrayBuffer(),
  };
  return fontCache;
}

const STARS = Array.from({ length: 18 }).map((_, i) => {
  const seed = (i + 1) * 9301;
  const r = (seed % 233280) / 233280;
  const r2 = ((seed * 13) % 233280) / 233280;
  return {
    left: 60 + r * 1080,
    top: 40 + r2 * 540,
    size: 4 + ((seed * 7) % 6),
    opacity: 0.4 + ((seed * 3) % 50) / 100,
  };
});

export default async function OpengraphImage() {
  const fonts = await loadFonts();

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
          background:
            "linear-gradient(135deg, #1F1735 0%, #2A1F4D 38%, #3D2F60 70%, #5A3E8C 100%)",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
          padding: "80px",
        }}
      >
        {STARS.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${s.left}px`,
              top: `${s.top}px`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              borderRadius: "9999px",
              background: "#E8C26A",
              opacity: s.opacity,
              boxShadow: "0 0 12px rgba(232,194,106,0.7)",
            }}
          />
        ))}

        <div
          style={{
            display: "flex",
            padding: "10px 28px",
            borderRadius: "9999px",
            background: "rgba(232,194,106,0.16)",
            border: "1px solid rgba(232,194,106,0.45)",
            color: "#F2D78A",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.02em",
            marginBottom: 36,
          }}
        >
          ✨ 사주 · 타로 친구 상담
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 152,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.0,
            marginBottom: 28,
          }}
        >
          별콩톡
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 38,
            fontWeight: 400,
            color: "rgba(255,255,255,0.86)",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: 880,
          }}
        >
          별콩이가 사주랑 타로로
          <br />
          네 고민을 같이 풀어줄게
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "rgba(255,255,255,0.7)",
            fontSize: 24,
            fontWeight: 400,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "9999px",
              background: "#E8C26A",
            }}
          />
          byeolkongtalk.com
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Pretendard", data: fonts.regular, weight: 400 },
        { name: "Pretendard", data: fonts.bold, weight: 700 },
      ],
    }
  );
}
