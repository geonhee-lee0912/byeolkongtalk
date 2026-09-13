// 오늘 사주 OG 이미지 — 별마루 공유용. 1200×630.
// 무상태: readings 가 아니라 룰 판정 결과라 세션·DB·PII 0 — 등급·간지를 URL 파라미터로만 받아 렌더.
// (has_sensitive 무관 — 오늘 사주는 상담이 아니라 룰 판정)
import { ImageResponse } from "next/og";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import type { DayTone } from "@/lib/byeolmaru/day-score";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import type { TenGod } from "@/lib/saju/pairing";

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

  // 🔴 하루 이름을 URL 로 그대로 받지 않는다 — 임의 문자열이 별콩톡 브랜드 카드에 렌더되면 그건
  //    남의 문구를 우리 OG 로 찍어주는 것이다. 십신 키만 받아 **서버가 DAY_NAME 으로 푼다**.
  //    모르는 값은 400 이 아니라 조용히 무시한다(옛 링크·오타가 깨진 이미지가 되지 않게).
  // ⚠️ `tgRaw in DAY_NAME` 는 안전하지 않아 쓰지 않는다 — DAY_NAME 은 객체 리터럴이라
  //    Object.prototype 을 상속하고 `in` 은 상속 체인까지 본다. 실측: "constructor"·"toString"·
  //    "__proto__" 같은 키가 전부 in-체크를 통과하고 DAY_NAME[그 키] 는 문자열이 아니라 네이티브
  //    함수/객체가 나온다(예: DAY_NAME.constructor === Object). 이 자리는 URL 로 들어오는 신뢰
  //    불가 입력이고, 이 저장소엔 "동적/신뢰불가 키로 config 조회 시 키 검증 누락"이 결과 화면을
  //    통째로 크래시낸 전례가 있다([RECO:] 마커, lib/reco-utils.ts). Object.hasOwn 은 프로토타입
  //    체인을 안 보고 **자기 소유 속성인지만** 봐서 이 클래스의 입력에 안전하다.
  const tgRaw = sp.get("tg");
  const dayName = tgRaw && Object.hasOwn(DAY_NAME, tgRaw) ? DAY_NAME[tgRaw as TenGod] : null;

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
          {/* 하루 이름이 제목 — 등급 3종보다 10종이 공유될 때 더 다양하고 "내 얘기"로 읽힌다.
              tg 없는 옛 링크(P5-2 이전 공유분)는 예전처럼 등급만 크게 나온다(하위호환). */}
          <div style={{ display: "flex", fontSize: dayName ? 64 : 72, color: "#F2D78A", fontWeight: 700, textAlign: "center" }}>
            {dayName ?? label}
          </div>
          {dayName ? (
            <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.85)", marginTop: 16 }}>
              {label}
            </div>
          ) : null}
          {ganji ? (
            <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.8)", marginTop: dayName ? 12 : 22 }}>
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
