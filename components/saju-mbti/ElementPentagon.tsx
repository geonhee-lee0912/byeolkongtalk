import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import { pentagonGeometry } from "@/lib/saju-mbti/pentagon";

// 오행 분포 오각차트. 순수 렌더(Server OK). 최대 오행이 외곽, 0 은 중심으로 눌림.
export function ElementPentagon({ dist, size = 200 }: { dist: Record<FiveElement, number>; size?: number }) {
  const g = pentagonGeometry(dist, size);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px]" role="img" aria-label="오행 분포 오각 차트">
      <title>오행 분포</title>
      <polygon points={g.ring} fill="none" stroke="#D4C7EE" strokeWidth={1} />
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
