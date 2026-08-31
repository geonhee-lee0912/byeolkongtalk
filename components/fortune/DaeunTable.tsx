import type { DaeunPillar } from "@/lib/saju/calc";
import type { DaeunLine } from "@/lib/fortune/generic-report";
import { ELEMENT_COLOR } from "@/lib/fortune/element";
import { daeunTheme } from "@/lib/fortune/daeun-theme";

// 대운(10년 단위) 표 — 나이·간지·오행(결정론) + 십신 국면 테마(결정론) + 개인화 한 줄(LLM, life_full).
// 한 줄은 LLM(lines) 우선, 없으면 테마 기본 설명으로 폴백 — legacy 리딩도 테마+기본 설명은 붙는다.
// 넓은 표 대신 세로 블록 리스트라 375px 폭에서도 가로 스크롤 없이 자연 개행.
export default function DaeunTable({
  daeun,
  dayStem,
  lines,
}: {
  daeun: DaeunPillar[];
  /** 일간(한글 천간) — 있으면 각 대운의 십신 국면 테마를 계산해 노출. */
  dayStem?: string;
  /** 대운 개인화 한 줄(LLM). startAge 로 각 대운 행과 매칭. */
  lines?: DaeunLine[];
}) {
  if (!daeun || daeun.length === 0) return null;

  const lineByAge = new Map<number, string>();
  for (const l of lines ?? []) {
    if (l && typeof l.startAge === "number" && typeof l.line === "string" && l.line.trim()) {
      lineByAge.set(l.startAge, l.line.trim());
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      <h3 className="text-[14.5px] font-extrabold text-eye-purple mb-1.5">🌌 대운 10년 흐름</h3>
      <p className="text-[11px] text-text-light/70 leading-snug mb-5">
        10년마다 바뀌는 인생의 큰 기운이야. 각 시기가 네 사주와 만나 어떤 국면을 여는지 담았어.
      </p>
      <div className="flex flex-col gap-4">
        {daeun.map((d, i) => {
          const theme = dayStem ? daeunTheme(dayStem, d.stem) : null;
          const desc = lineByAge.get(d.startAge) ?? theme?.desc ?? null;
          return (
            <div key={i} className="pb-4 border-b border-lilac-mid/15 last:border-0 last:pb-0">
              {/* 나이 + 십신 국면 테마 배지 */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[13px] font-extrabold text-[#4F4A5E] tabular-nums">
                  {d.startAge}~{d.endAge}세
                </span>
                {theme && (
                  <span className="flex items-center gap-1 bg-lilac-soft/60 rounded-full pl-2 pr-2.5 py-0.5 text-[11.5px] font-bold text-eye-purple shrink-0">
                    <span aria-hidden>{theme.emoji}</span>
                    {theme.label}
                  </span>
                )}
              </div>
              {/* 간지 + 오행 */}
              <div className="flex items-center gap-1.5 mb-1.5 text-[11px]">
                <span className="text-[13px] font-bold text-eye-purple leading-none">{d.hanja}</span>
                <span className="text-text-light/70">
                  {d.stem}
                  {d.branch}
                </span>
                <span className="text-text-light/30">·</span>
                <span className="font-bold" style={{ color: ELEMENT_COLOR[d.stemElement] }}>
                  {d.stemElement}
                </span>
                <span className="font-bold" style={{ color: ELEMENT_COLOR[d.branchElement] }}>
                  {d.branchElement}
                </span>
              </div>
              {/* 개인화 한 줄(LLM) 또는 테마 기본 설명 */}
              {desc && (
                <p className="text-[12.5px] leading-[1.65] text-[#4F4A5E]/90">{desc}</p>
              )}
            </div>
          );
        })}
      </div>
      {dayStem && (
        <p className="text-[11px] text-text-light/60 mt-4 leading-snug">
          국면 테마는 네 일간과 그 시기 대운의 관계(십신)로 자동 계산한 거야.
        </p>
      )}
    </div>
  );
}
