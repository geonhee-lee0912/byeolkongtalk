import type { SajuResult } from "@/lib/saju/calc";
import type { ElementRelation } from "@/lib/saju/pairing";
import { pairRelation } from "@/lib/saju/pairing";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

// 궁합 매칭도 — 두 사주로 관계를 결정론 요약(pairRelation). LLM 미경유.
// 두 일간 노드 + 오행 관계 헤드라인 + 천간합(끌림)·육합(결속) 배지 + 십신 양방향 라벨.

function elementHeadline(rel: ElementRelation, a: string, b: string): string {
  switch (rel) {
    case "비화":
      return "닮은 기운 · 편안한 사이";
    case "아생":
      return `${a}가 ${b}를 북돋우는 결`;
    case "생아":
      return `${b}가 ${a}를 북돋우는 결`;
    case "아극":
      return `${a}가 ${b}를 이끄는 결`;
    case "극아":
      return `${b}가 ${a}를 이끄는 결`;
  }
}

function Node({ saju, name }: { saju: SajuResult; name: string }) {
  const hanja = saju.pillars?.day?.hanja?.slice(0, 1) ?? saju.dayStem;
  const color = ELEMENT_COLOR[saju.dayElement];
  return (
    <div className="flex flex-col items-center gap-1.5 w-[92px] shrink-0">
      <div
        className="w-[62px] h-[62px] rounded-full flex items-center justify-center text-white shadow-[0_4px_14px_rgba(40,30,70,0.15)]"
        style={{ background: color }}
      >
        <span className="text-[26px] font-extrabold leading-none">{hanja}</span>
      </div>
      <span className="text-[12.5px] font-bold text-eye-purple max-w-[92px] truncate">{name}</span>
      <span className="text-[10.5px] font-semibold" style={{ color }}>
        {saju.dayStem}·{saju.dayElement}
      </span>
    </div>
  );
}

export default function CompatMatchDiagram({
  a,
  b,
  names,
}: {
  a: SajuResult;
  b: SajuResult;
  names: { a: string; b: string };
}) {
  let rel;
  try {
    rel = pairRelation(a, b);
  } catch {
    return null; // 비정상 사주(legacy) 방어
  }

  const badges: { emoji: string; label: string }[] = [];
  if (rel.heavenlyCombo) badges.push({ emoji: "⚡", label: "끌림" });
  if (rel.sixCombo) badges.push({ emoji: "🔗", label: "결속" });

  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      <h3 className="text-[14.5px] font-extrabold text-lilac-deep mb-1.5">💞 궁합 한눈에</h3>
      <p className="text-[11px] text-text-light/70 leading-snug mb-4">
        두 일간이 만나 만드는 기운의 결이야. 아래 풀이의 결정론적 뼈대.
      </p>

      {/* 두 노드 + 가운데 배지 */}
      <div className="flex items-center justify-between gap-1">
        <Node saju={a} name={names.a} />
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {badges.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {badges.map((bd) => (
                <span
                  key={bd.label}
                  className="inline-flex items-center gap-1 rounded-full bg-lilac-soft/60 px-2.5 py-1 text-[11px] font-bold text-lilac-deep"
                >
                  <span aria-hidden>{bd.emoji}</span>
                  {bd.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[18px] text-lilac-mid" aria-hidden>
              ↔
            </span>
          )}
        </div>
        <Node saju={b} name={names.b} />
      </div>

      {/* 오행 관계 헤드라인 */}
      <p className="text-center text-[13.5px] font-extrabold text-eye-purple mt-4">
        {elementHeadline(rel.element, names.a, names.b)}
      </p>

      {/* 십신 양방향 */}
      <div className="mt-4 pt-4 border-t border-lilac-mid/20 flex flex-col gap-2">
        <div className="flex items-baseline gap-2 text-[12.5px]">
          <span className="text-text-light/70 shrink-0">
            {names.a}에게 {names.b}는
          </span>
          <span className="font-bold text-eye-purple">{rel.labelAtoB}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[12.5px]">
          <span className="text-text-light/70 shrink-0">
            {names.b}에게 {names.a}는
          </span>
          <span className="font-bold text-eye-purple">{rel.labelBtoA}</span>
        </div>
      </div>
    </div>
  );
}
