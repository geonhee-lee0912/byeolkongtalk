// components/relationship/DollAvatar.tsx — 우리 사이 파일 허브 아바타 (프레젠테이셔널).
// kind="partner": 관계 상태별 인형 색 그라데이션 + 🧸. kind="me": 카톡 프사(있으면) 또는 금색 원 + 이니셜/기본 이모지.
import { DOLL_COLORS, type RelationshipStatus } from "@/lib/relationship/types";

export interface DollAvatarProps {
  kind: "partner" | "me";
  status?: RelationshipStatus; // partner일 때 색 결정
  imageUrl?: string | null; // me일 때 카톡 프사(없으면 이니셜/기본)
  name?: string; // me 이니셜 폴백용
  size?: number; // px, 기본 44
}

// status 가 없거나(방어: 구데이터·타입 밖 값) DOLL_COLORS 에 키가 없을 때의 중립색.
// 기존 4개 상태색(특히 breakup 회색)과 겹치지 않는 별도 톤 — "알 수 없음"이 "이별"로 오독되지 않도록.
const DEFAULT_PAIR: [string, string] = ["#E3E1EA", "#C6C2D6"];

export default function DollAvatar({ kind, status, imageUrl, name, size = 44 }: DollAvatarProps) {
  const boxStyle = { width: size, height: size };
  const glyphSize = size * 0.5;

  if (kind === "partner") {
    // DOLL_COLORS[status] 무가드 인덱싱 금지 — status undefined/미지 값이면 기본색으로.
    const pair = (status && DOLL_COLORS[status]) || DEFAULT_PAIR;
    return (
      <div
        className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
        style={{
          ...boxStyle,
          background: `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`,
        }}
      >
        <span style={{ fontSize: glyphSize }} aria-hidden>
          🧸
        </span>
      </div>
    );
  }

  // kind === "me"
  if (imageUrl) {
    return (
      <div className="shrink-0 rounded-full overflow-hidden" style={boxStyle}>
        {/* 카카오 프사는 외부 호스트 URL — next.config.ts 에 images.remotePatterns 미설정이라
            next/image 최적화 대상이 될 수 없다(설정 없이 쓰면 400). app/mypage/page.tsx 의
            profile_img 렌더와 동일하게 plain img + no-img-element 억제로 처리. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name ?? "내 프로필"} className="w-full h-full object-cover" />
      </div>
    );
  }

  const initial = name?.trim()?.[0]?.toUpperCase();
  return (
    <div
      className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
      style={{ ...boxStyle, background: "#E8C26A" }}
    >
      <span style={{ fontSize: glyphSize, color: "#1F1735" }} className="font-bold" aria-hidden>
        {initial || "🙂"}
      </span>
    </div>
  );
}
