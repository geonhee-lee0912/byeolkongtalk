// 2026 병오년 — 붉은 말. saju_full(2026년 사주 분석) 전용 아이콘.
// public/red_horse.png 이미지를 사용한다.

import Image from "next/image";

export default function RedHorseIcon({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/red_horse.png"
      alt="2026 붉은 말"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
