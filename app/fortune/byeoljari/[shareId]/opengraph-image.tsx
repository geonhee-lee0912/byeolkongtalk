import { ImageResponse } from "next/og";

// 별자리 공유 전용 OG(1200×630) — 밤하늘 + 발광 오행 별 + "우리 인연 별자리".
// 개인정보 없이 일반 문구(개인 별자리는 noindex, OG 는 공유 미리보기용).
// ⚠️ dev(Vercel SSO)에선 외부 스크래퍼가 못 받아 카톡 미리보기가 빔 — prod/실기기 확인.
export const runtime = "nodejs";
export const alt = "우리 인연 별자리 · 별콩톡";
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

// 골드 별가루(결정적)
const DUST = Array.from({ length: 20 }).map((_, i) => {
  const seed = (i + 1) * 9301;
  const r = (seed % 233280) / 233280;
  const r2 = ((seed * 13) % 233280) / 233280;
  return {
    left: 40 + r * 1120,
    top: 30 + r2 * 570,
    size: 3 + ((seed * 7) % 5),
    opacity: 0.35 + ((seed * 3) % 50) / 100,
  };
});

// 발광 오행 별(별자리 색감) — 텍스트 안 가리게 좌우 가장자리 배치
const NODES = [
  { left: 150, top: 150, color: "#FF8A6B", r: 26 },
  { left: 95, top: 330, color: "#EDE6D6", r: 18 },
  { left: 215, top: 470, color: "#4FD6B8", r: 20 },
  { left: 1045, top: 175, color: "#8AB4F8", r: 22 },
  { left: 1110, top: 360, color: "#FBC94D", r: 16 },
  { left: 995, top: 480, color: "#4FD6B8", r: 18 },
];

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
            "linear-gradient(135deg, #1F1735 0%, #2A1F4D 45%, #3D2F60 100%)",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
          padding: "80px",
        }}
      >
        {DUST.map((s, i) => (
          <div
            key={`d-${i}`}
            style={{
              position: "absolute",
              left: `${s.left}px`,
              top: `${s.top}px`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              borderRadius: "9999px",
              background: "#E8C26A",
              opacity: s.opacity,
              boxShadow: "0 0 10px rgba(232,194,106,0.7)",
            }}
          />
        ))}

        {NODES.map((n, i) => (
          <div
            key={`n-${i}`}
            style={{
              position: "absolute",
              left: `${n.left}px`,
              top: `${n.top}px`,
              width: `${n.r}px`,
              height: `${n.r}px`,
              borderRadius: "9999px",
              background: n.color,
              boxShadow: `0 0 26px ${n.color}`,
              opacity: 0.92,
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
            marginBottom: 34,
          }}
        >
          ✨ 사주로 보는 인연 별자리
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.0,
            marginBottom: 30,
          }}
        >
          우리 인연 별자리
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 38,
            fontWeight: 400,
            color: "rgba(255,255,255,0.86)",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: 860,
          }}
        >
          생일만 넣으면 친구들과의 사주 인연이
          <br />
          별자리로 이어져
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
          별콩톡 · byeolkongtalk.com
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
