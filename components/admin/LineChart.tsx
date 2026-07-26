// components/admin/LineChart.tsx — 의존성 없는 SVG 라인차트.
type Series = { label: string; color: string; values: number[] };

/** x축 눈금 최대 개수 — 30일 라벨을 다 그리면 글자가 겹쳐 못 읽는다. */
const MAX_TICKS = 7;

/**
 * 눈금으로 쓸 인덱스. 균등 간격으로 고르되 **마지막(=최신)은 항상 포함**한다 —
 * 추세를 볼 때 기준이 되는 건 최신 날짜라, 그게 빠지면 어느 구간을 보고 있는지 알 수 없다.
 * 마지막 직전 눈금과 붙어버리는 경우(간격의 절반 미만)는 그 눈금을 버려 겹침을 막는다.
 */
function tickIndexes(n: number): number[] {
  if (n <= 1) return n === 1 ? [0] : [];
  const step = Math.max(1, Math.ceil(n / MAX_TICKS));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) idx.push(i);
  const last = n - 1;
  if (idx.length && last - idx[idx.length - 1] < step / 2) idx.pop();
  idx.push(last);
  return idx;
}

/** 'YYYY-MM-DD' → 'MM-DD' (연도는 축에서 군더더기). 다른 형식이면 그대로 둔다. */
const shortDate = (label: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(label) ? label.slice(5) : label;

export function LineChart({
  labels,
  series,
  height = 160,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  // 하단 여백은 x축 라벨 자리를 확보해야 해서 pad 보다 크다 (라벨이 축선에 물리지 않게).
  const W = 640, H = height, pad = 24, padBottom = 40;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - padBottom - (v / max) * (H - pad - padBottom);
  const ticks = tickIndexes(labels.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <line x1={pad} y1={H - padBottom} x2={W - pad} y2={H - padBottom} stroke="rgba(255,255,255,0.15)" />
      {ticks.map((i) => (
        <g key={i}>
          <line
            x1={x(i)}
            y1={H - padBottom}
            x2={x(i)}
            y2={H - padBottom + 4}
            stroke="rgba(255,255,255,0.25)"
          />
          <text
            x={x(i)}
            y={H - padBottom + 16}
            fill="rgba(255,255,255,0.45)"
            fontSize={10}
            // 양 끝 라벨이 뷰박스를 넘지 않게 앵커를 붙인다 (middle 이면 잘려 보인다)
            textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          >
            {shortDate(labels[i])}
          </text>
        </g>
      ))}
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
