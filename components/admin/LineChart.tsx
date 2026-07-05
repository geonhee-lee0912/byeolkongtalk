// components/admin/LineChart.tsx — 의존성 없는 SVG 라인차트.
type Series = { label: string; color: string; values: number[] };

export function LineChart({
  labels,
  series,
  height = 160,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const W = 640, H = height, pad = 24;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="rgba(255,255,255,0.15)" />
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
      ))}
      {series.map((s, si) => (
        <text key={s.label} x={pad} y={12 + si * 14} fill={s.color} fontSize={11}>
          ● {s.label} (max {max.toLocaleString()})
        </text>
      ))}
    </svg>
  );
}
