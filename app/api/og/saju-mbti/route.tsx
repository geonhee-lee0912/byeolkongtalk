// 사주 MBTI OG 이미지 — 카카오/트위터 공유 미리보기용. 1200×630.
// stateless: 쿼리 결과 토큰(?r=)만으로 렌더(DB·PII 0). 무효 토큰 400.
import { ImageResponse } from "next/og";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { decodeResult } from "@/lib/saju-mbti/share-tokens";
import { TYPE_CONTENT, MATCH_NARRATIVE } from "@/lib/saju-mbti/content";
import { characterImage } from "@/lib/saju-mbti/character-image";

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
  const rl = checkRateLimit({ namespace: "og_saju_mbti_ip", key: getClientIp(req), max: 30, windowMs: 60_000 });
  if (!rl.ok) return new Response("rate_limited", { status: 429, headers: { "Retry-After": "60" } });

  const token = new URL(req.url).searchParams.get("r");
  const d = decodeResult(token);
  if (!d) return new Response("invalid", { status: 400 });
  const content = TYPE_CONTENT[d.paljaCode];
  if (!content) return new Response("invalid", { status: 400 });
  const narrative = MATCH_NARRATIVE[d.band];
  const origin = new URL(req.url).origin;
  const charPath = characterImage(d.paljaCode);

  const font = await getFont();

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
          <span style={{ color: "#E8C26A" }}>✨</span>
          <span>별콩톡 사주 MBTI</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {charPath ? (
            <img
              src={`${origin}${charPath}`}
              width={190}
              height={190}
              style={{ width: 190, height: 190, objectFit: "contain" }}
            />
          ) : null}

          <div style={{ display: "flex", fontSize: 64, color: "#F2D78A", marginTop: 10 }}>{content.character}</div>
          <div style={{ display: "flex", fontSize: 22, opacity: 0.7, marginTop: 6 }}>
            {d.paljaCode} · {content.hanja} · {d.element} 기운
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#FFF8F0", marginTop: 22, maxWidth: 860, textAlign: "center", lineHeight: 1.5 }}>
            {content.oneLiner}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              background: "rgba(232,194,106,0.15)",
              border: "1px solid rgba(232,194,106,0.4)",
              borderRadius: 999,
              padding: "8px 24px",
              fontSize: 24,
              color: "#F2D78A",
            }}
          >
            {narrative.title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, opacity: 0.6 }}>
          <span>나 {content.character}래, 넌?</span>
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
