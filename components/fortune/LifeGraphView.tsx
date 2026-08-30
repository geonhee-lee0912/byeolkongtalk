import type { LifeGraphReport } from "@/lib/fortune/life-graph-report";

// 인생 곡선 SVG — 대운 구간(x) × 흐름 점수 0~100(y). 반응형 viewBox.
function Curve({ decades }: { decades: LifeGraphReport["decades"] }) {
  const W = 320;
  const H = 150;
  const padX = 14;
  const padY = 18;
  const n = decades.length;
  if (n === 0) return null;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (score: number) => padY + (1 - score / 100) * (H - padY * 2);
  const pts = decades.map((d, i) => [x(i), y(d.score)] as const);
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${padX},${H - padY} ${line} ${W - padX},${H - padY}`;
  const maxI = decades.reduce((m, d, i) => (d.score > decades[m].score ? i : m), 0);
  const minI = decades.reduce((m, d, i) => (d.score < decades[m].score ? i : m), 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="인생 대운 곡선">
      <defs>
        <linearGradient id="lifeArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9F8AD0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9F8AD0" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#lifeArea)" />
      <polyline points={line} fill="none" stroke="#9F8AD0" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([px, py], i) => {
        const hot = i === maxI;
        const cold = i === minI;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={hot || cold ? 4.5 : 3} fill={hot ? "#E8C26A" : cold ? "#7A6BA0" : "#9F8AD0"} stroke="#fff" strokeWidth="1.5" />
            <text x={px} y={H - 4} textAnchor="middle" fontSize="7" fill="#7A6BA0">
              {decades[i].ageLabel.replace(/세.*$/, "")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function LifeGraphView({ report }: { report: LifeGraphReport }) {
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        <p className="text-[14px] leading-[1.9] text-[#4F4A5E] whitespace-pre-line">{report.intro}</p>
      </div>

      {/* 곡선 차트 */}
      <div className="bg-white rounded-3xl border border-lilac-mid/30 shadow-[0_8px_30px_rgba(40,30,70,0.10)] px-[18px] py-6">
        <h3 className="text-[14.5px] font-extrabold text-lilac-deep mb-3">📉 내 인생 곡선 (대운)</h3>
        <Curve decades={report.decades} />
        <div className="flex gap-4 justify-center mt-2 text-[11px]">
          <span className="text-[#B5843F]">● 최고 시기</span>
          <span className="text-text-light">● 웅크리는 시기</span>
        </div>
      </div>

      {/* 최고/저점 */}
      <div className="flex flex-col gap-3">
        <div className="bg-gold-soft/25 rounded-2xl px-4 py-3.5 border border-gold/40">
          <div className="text-[12.5px] font-extrabold text-[#B5843F] mb-1">☀️ 가장 빛나는 시기</div>
          <p className="text-[13px] text-[#4F4A5E] leading-[1.8] whitespace-pre-line">{report.peak}</p>
        </div>
        <div className="bg-lilac-soft/40 rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
          <div className="text-[12.5px] font-extrabold text-lilac-deep mb-1">🌙 웅크리며 준비할 시기</div>
          <p className="text-[13px] text-[#4F4A5E] leading-[1.8] whitespace-pre-line">{report.valley}</p>
        </div>
      </div>

      {/* 구간별 상세 */}
      {report.decades.map((d, i) => (
        <div key={i} className="bg-white rounded-2xl border border-lilac-mid/20 px-4 py-3.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-extrabold text-eye-purple">{d.ageLabel}</span>
            <span className="text-[11px] tabular-nums text-lilac-deep font-bold">{d.score}점</span>
          </div>
          <div className="text-[12.5px] font-bold text-[#4A4458] mb-0.5">{d.headline}</div>
          <p className="text-[12.5px] text-[#4F4A5E] leading-[1.75] whitespace-pre-line">{d.body}</p>
        </div>
      ))}

      <div className="rounded-3xl px-6 py-6 text-white" style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}>
        <h3 className="text-[14px] font-bold text-gold mb-2">🌙 별콩이의 한마디</h3>
        <p className="text-[13.5px] leading-[1.95] text-white/90 whitespace-pre-line">{report.note}</p>
      </div>
    </div>
  );
}
