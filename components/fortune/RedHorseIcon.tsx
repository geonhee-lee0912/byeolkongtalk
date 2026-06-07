// 2026 병오년 — 붉은 말. saju_full(2026년 사주 분석) 전용 아이콘.
// 이모지로는 색을 입힐 수 없어 단색 SVG 실루엣으로 그린다.

export default function RedHorseIcon({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#DC2626"
      role="img"
      aria-label="2026 붉은 말"
      className={className}
    >
      {/* 몸통 */}
      <path d="M7 11C7 9 9 8.5 12 8.5L16.5 8.5C18.5 8.5 19.5 9.5 19.5 11C19.5 12.8 18.3 13.5 16.5 13.5L9.5 13.5C8 13.5 7 12.5 7 11Z" />
      {/* 목 + 머리 (좌상단) */}
      <path d="M7 11L5 6C4.7 5.2 5.1 4.5 5.9 4.5L6.3 4.5L6.1 2.8C6.05 2.3 6.6 2.05 6.95 2.45L8.3 4C9 4.8 9.4 5.8 9.4 6.9L9.4 11Z" />
      {/* 꼬리 */}
      <path d="M19.3 9C21 9 21.6 10.6 21.2 12.2C21 13 20.4 13.4 19.8 13C20.4 11.7 20.2 10.2 19.3 9.3Z" />
      {/* 다리 */}
      <rect x="8.5" y="13" width="1.7" height="7" rx="0.85" />
      <rect x="11" y="13" width="1.7" height="7" rx="0.85" />
      <rect x="14.5" y="13" width="1.7" height="7" rx="0.85" />
      <rect x="17" y="13" width="1.7" height="6.5" rx="0.85" />
      {/* 눈 */}
      <circle cx="6.5" cy="5.9" r="0.7" fill="#fff" />
    </svg>
  );
}
