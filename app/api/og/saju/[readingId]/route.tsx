// 사주 풀이 OG 이미지 — 카카오톡 공유 / 트위터 등 미리보기용.
// 1200×630 (카카오 권장 비율). 다크 그라데이션 + 4기둥 한자 + 별콩이 한마디 + 워터마크.
//
// 폰트는 Pretendard CDN 에서 fetch — 모듈 레벨 캐싱으로 cold start 외엔 IO 없음.
// 카드 이미지 / 별콩이 캐릭터 png 는 일단 텍스트 / 별 파티클로 대체 (sharp 미설치)

import { ImageResponse } from "next/og";
import { getServiceSupabase } from "@/lib/supabase";
import { extractClosingLine } from "@/lib/saju/closing";
import type { SajuResult } from "@/lib/saju/calc";

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
  _req: Request,
  { params }: { params: Promise<{ readingId: string }> }
) {
  const { readingId } = await params;

  // UUID 형식 검증 — 잘못된 ID로 무한 sharp 호출 차단
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(readingId)) {
    return new Response("invalid_id", { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("saju_data, question, has_sensitive")
    .eq("id", readingId)
    .maybeSingle();

  if (!reading) {
    return new Response("not_found", { status: 404 });
  }
  if (reading.has_sensitive) {
    // 위기 readings 는 공유 이미지 자체 생성 X
    return new Response("forbidden", { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", readingId)
    .order("created_at", { ascending: true });

  const saju = reading.saju_data as SajuResult;
  const closingLine = extractClosingLine(messages ?? []) ?? "별콩이가 응원할게 ✨";

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
          padding: "60px 70px",
          color: "white",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {/* 별 파티클 */}
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
          <span style={{ color: "#E8C26A" }}>✨</span>
          <span>별콩이의 사주 풀이</span>
        </div>

        {/* 4기둥 */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 30,
            marginBottom: 30,
            justifyContent: "center",
          }}
        >
          {(["year", "month", "day", "hour"] as const).map((k, i) => {
            const p = saju.pillars[k];
            const labels = ["연", "월", "일", "시"];
            return (
              <div
                key={k}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 16, opacity: 0.6 }}>{labels[i]}</div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 110,
                    height: 180,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    border: "1px solid rgba(232,194,106,0.3)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 56,
                      color: "#F2D78A",
                    }}
                  >
                    {p.hanja[0]}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 56,
                      color: "#F2D78A",
                      borderTop: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {p.hanja[1]}
                  </div>
                </div>
                <div style={{ fontSize: 14, opacity: 0.7 }}>
                  {p.stem}
                  {p.branch}
                </div>
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
          <span>일간 {saju.dayStem} · {saju.dayElement}</span>
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
