import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

// 오행 상생상극도 — 결정론(saju.elementCount) SVG. LLM 미경유.
// 오각형 노드(내 오행 강약 = 크기·진하기) + 상생(둘레, 시계방향)·상극(안쪽 별) 관계선.
// 목생화·화생토·토생금·금생수·수생목 / 목극토·토극수·수극화·화극금·금극목.

const LABEL: Record<FiveElement, string> = { 목: "목", 화: "화", 토: "토", 금: "금", 수: "수" };

// 오각형 좌표(cx160 cy150 R105) — 꼭대기 목, 시계방향 목→화→토→금→수(둘레=상생).
const NODES: { el: FiveElement; x: number; y: number }[] = [
  { el: "목", x: 160, y: 45 },
  { el: "화", x: 260, y: 118 },
  { el: "토", x: 222, y: 235 },
  { el: "금", x: 98, y: 235 },
  { el: "수", x: 60, y: 118 },
];
const SHENG: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]; // 상생(i→i+1)
const KE: [number, number][] = [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]]; // 상극(i→i+2)

const SHENG_COLOR = "#C4B8E0"; // 소프트 라일락(북돋움)
const KE_COLOR = "#D8AE9E"; // 소프트 클레이(누름)

export default function ElementCycleDiagram({
  saju,
  className,
}: {
  saju: SajuResult | null;
  className?: string;
}) {
  if (!saju) return null;
  const counts = saju.elementCount ?? { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const max = Math.max(1, ...NODES.map((n) => counts[n.el] ?? 0));
  // 크기 대비를 크게 — 0개는 확 작게(12), 많을수록 확 크게(~34)
  const radius = (c: number) => (c === 0 ? 12 : 15 + Math.round((c / max) * 19)); // 12~34
  const nodeR = NODES.map((n) => radius(counts[n.el] ?? 0));
  const CENTER = { x: 160, y: 150 };

  // A→B 선을 두 노드 가장자리에서 끊는다(중심선 대신 — 화살표가 노드에 안 가리게).
  const seg = (ai: number, bi: number) => {
    const a = NODES[ai];
    const b = NODES[bi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return {
      x1: a.x + ux * (nodeR[ai] + 2),
      y1: a.y + uy * (nodeR[ai] + 2),
      x2: b.x - ux * (nodeR[bi] + 7), // 화살표 여유
      y2: b.y - uy * (nodeR[bi] + 7),
    };
  };

  return (
    <div
      className={`bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6${className ? ` ${className}` : ""}`}
    >
      <h3 className="text-[14.5px] font-extrabold text-lilac-deep mb-1.5">🔄 내 오행의 상생상극</h3>
      <p className="text-[11px] text-text-light/70 leading-snug mb-2">
        다섯 기운이 서로 북돋우고(상생) 누르는(상극) 관계야. 원이 클수록 내 사주에 그 기운이 많아.
      </p>
      <svg viewBox="0 -18 320 320" className="w-full max-w-[320px] mx-auto block" role="img" aria-label="오행 상생상극도">
        <defs>
          <marker id="arrowSheng" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={SHENG_COLOR} />
          </marker>
          <marker id="arrowKe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={KE_COLOR} />
          </marker>
        </defs>

        {/* 상극(안쪽 별) — 점선 */}
        {KE.map(([ai, bi], i) => {
          const s = seg(ai, bi);
          return (
            <line
              key={`ke-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={KE_COLOR}
              strokeWidth={1.4}
              strokeDasharray="3 4"
              markerEnd="url(#arrowKe)"
            />
          );
        })}

        {/* 상생(둘레) — 실선 */}
        {SHENG.map(([ai, bi], i) => {
          const s = seg(ai, bi);
          return (
            <line
              key={`sheng-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={SHENG_COLOR}
              strokeWidth={2.2}
              markerEnd="url(#arrowSheng)"
            />
          );
        })}

        {/* 노드 — 원 안엔 오행 글자만(크기에 맞춰 스케일), 개수는 바깥(중심 반대쪽)에 */}
        {NODES.map((n, i) => {
          const c = counts[n.el] ?? 0;
          const r = nodeR[i];
          const color = ELEMENT_COLOR[n.el];
          const opacity = c === 0 ? 0.18 : 0.55 + 0.45 * (c / max);
          const charSize = Math.max(9, Math.min(15, r * 0.82));
          const dx = n.x - CENTER.x;
          const dy = n.y - CENTER.y;
          const dl = Math.hypot(dx, dy) || 1;
          const lx = n.x + (dx / dl) * (r + 16);
          const ly = n.y + (dy / dl) * (r + 16);
          return (
            <g key={n.el}>
              <circle cx={n.x} cy={n.y} r={r} fill={color} opacity={opacity} />
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize={charSize} fontWeight="800" fill="#fff">
                {LABEL[n.el]}
              </text>
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11.5"
                fontWeight="800"
                fill={c === 0 ? "#B5AEC4" : color}
              >
                {c}개
              </text>
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="flex items-center justify-center gap-4 mt-1">
        <span className="flex items-center gap-1.5 text-[11px] text-text-light">
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="19" y2="4" stroke={SHENG_COLOR} strokeWidth="2.2" />
          </svg>
          상생 · 북돋움
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-text-light">
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="19" y2="4" stroke={KE_COLOR} strokeWidth="1.6" strokeDasharray="3 4" />
          </svg>
          상극 · 누름
        </span>
      </div>
    </div>
  );
}
