import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import { pentagonGeometry } from "@/lib/saju-mbti/pentagon";

// 오행 분포 오각차트. 순수 렌더(Server OK). 최대 오행이 외곽, 0 은 중심으로 눌림.
export function ElementPentagon({ dist, size = 200 }: { dist: Record<FiveElement, number>; size?: number }) {
  const g = pentagonGeometry(dist, size);
  const PAD = 18; // 라벨(오행+값)이 오각 밖이라 viewBox 여백 없으면 잘림(특히 상단 목)
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const ringPoints = (f: number) =>
    [0, 1, 2, 3, 4]
      .map((i) => `${(g.cx + f * g.r * Math.cos(ang(i))).toFixed(2)},${(g.cy + f * g.r * Math.sin(ang(i))).toFixed(2)}`)
      .join(" ");
  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${size + PAD * 2} ${size + PAD * 2}`}
      className="w-full max-w-[220px]"
      role="img"
      aria-label="오행 분포 오각 차트"
    >
      <title>오행 분포</title>
      {/* 동심 오각 눈금 + 스포크 — 점수(면적) 가늠용 */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={ringPoints(f)}
          fill="none"
          stroke="#D4C7EE"
          strokeWidth={f === 1 ? 1 : 0.6}
          strokeOpacity={f === 1 ? 0.9 : 0.4}
        />
      ))}
      {g.axes.map((_, i) => (
        <line
          key={`spoke-${i}`}
          x1={g.cx}
          y1={g.cy}
          x2={g.cx + g.r * Math.cos(ang(i))}
          y2={g.cy + g.r * Math.sin(ang(i))}
          stroke="#D4C7EE"
          strokeWidth={0.5}
          strokeOpacity={0.35}
        />
      ))}
      <polygon
        points={g.polygon}
        fill="#9F8AD0"
        fillOpacity={0.22}
        stroke="#9F8AD0"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {g.axes.map((a) => (
        <g key={a.element}>
          <circle cx={a.x} cy={a.y} r={3.5} fill={ELEMENT_COLORS[a.element].bar} />
          <text
            x={a.labelX}
            y={a.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontWeight={500}
            fill={ELEMENT_COLORS[a.element].text}
          >
            {a.element}
            <tspan fontSize={10} fillOpacity={0.7}>{` ${a.value}`}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}
