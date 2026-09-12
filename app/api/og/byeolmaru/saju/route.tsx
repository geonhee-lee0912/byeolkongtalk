// 오늘 사주 OG 이미지 — 별마루 공유용. 1200×630.
// 무상태: readings 가 아니라 룰 판정 결과라 세션·DB·PII 0 — 등급·간지를 URL 파라미터로만 받아 렌더.
// (has_sensitive 무관 — 오늘 사주는 상담이 아니라 룰 판정)
import { ImageResponse } from "next/og";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import type { DayTone } from "@/lib/byeolmaru/day-score";

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

// tone → label 역매핑. lib/byeolmaru/day-score.ts 의 dayGrade() 가 만드는 라벨과 정확히 일치시킬 것
// (dayGrade 는 score→grade 라 여기선 역매핑 소상수로 둔다 — 드리프트 시 육안 비교로만 잡히니 주의).
const GRADE_LABEL: Record<DayTone, string> = {
  good: "잘 맞는 날",
  normal: "무난한 날",
  caution: "살짝 챙길 날",
};

const GANJI_MAX_LEN = 20;

export async function GET(req: Request) {
  maybeSweepExpired();
  const rl = checkRateLimit({ namespace: "og_byeolmaru_saju_ip", key: getClientIp(req), max: 30, windowMs: 60_000 });
  if (!rl.ok) return new Response("rate_limited", { status: 429, headers: { "Retry-After": "60" } });

  const sp = new URL(req.url).searchParams;
  const grade = sp.get("grade");
  if (grade !== "good" && grade !== "normal" && grade !== "caution") {
    return new Response("invalid", { status: 400 });
  }
  const ganjiRaw = sp.get("ganji");
  const ganji = ganjiRaw ? ganjiRaw.slice(0, GANJI_MAX_LEN) : null;

  const label = GRADE_LABEL[grade];
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
          <span>별콩톡 오늘 사주</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 72, color: "#F2D78A", fontWeight: 700, textAlign: "center" }}>
            {label}
          </div>
          {ganji ? (
            <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.8)", marginTop: 22 }}>
              오늘 · {ganji}
            </div>
          ) : null}
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
