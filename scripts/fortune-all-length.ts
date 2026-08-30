// 신규 15종 분량 실측 — 재튜닝 판단용. Run: set -a && . ./.env.local && npx tsx scripts/fortune-all-length.ts
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { fortuneModel } from "@/lib/fortune/model";
import { fortuneResponseFormat } from "@/lib/fortune/response-format";
import { parseGenericReportJson, isGenericFortuneType, needsDaeun } from "@/lib/fortune/generic-report";
import { parseReportCardJson } from "@/lib/fortune/report-card-report";
import { parseLifeGraphJson } from "@/lib/fortune/life-graph-report";
import { generateOnce } from "@/lib/claude";
import { calcSaju, calcDaeun, type SajuInput } from "@/lib/saju/calc";

const B: SajuInput = { year: 1994, month: 5, day: 12, hour: 9, minute: 0, gender: "female" };
const NEW: FortuneType[] = [
  "nature_self", "talent_path", "user_manual", "element_balance", "life_full",
  "love_self", "love_year", "marriage", "wealth_vessel", "wealth_year",
  "career_timing", "fact_bomb", "past_life", "saju_report_card", "life_graph",
];
const prose = (o: unknown): number => {
  let n = 0;
  const w = (v: unknown) => { if (typeof v === "string") n += v.length; else if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === "object") Object.values(v).forEach(w); };
  w(o); return n;
};
async function main() {
  const saju = calcSaju(B);
  console.log("type            별  섹션  산문자수  별당  파싱");
  for (const t of NEW) {
    const input = needsDaeun(t) ? { saju, daeun: calcDaeun(B, 9) } : { saju };
    try {
      const raw = await generateOnce(buildFortuneSystem(t, input), [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[t], undefined, fortuneModel(t), fortuneResponseFormat(t));
      let ai: unknown = null, secs = 0;
      if (t === "saju_report_card") { ai = parseReportCardJson(raw); secs = (ai as { scores?: unknown[] })?.scores?.length ?? 0; }
      else if (t === "life_graph") { ai = parseLifeGraphJson(raw); secs = (ai as { decades?: unknown[] })?.decades?.length ?? 0; }
      else if (isGenericFortuneType(t)) { ai = parseGenericReportJson(raw); secs = (ai as { sections?: unknown[] })?.sections?.length ?? 0; }
      const cost = FORTUNE_CONFIG[t].cost;
      const len = ai ? prose(ai) : raw.length;
      const perStar = cost > 0 ? Math.round(len / cost) : 0;
      console.log(`${t.padEnd(16)} ${String(cost).padStart(2)}  ${String(secs).padStart(4)}  ${String(len).padStart(7)}  ${String(perStar).padStart(4)}  ${ai ? "OK" : "❌"}`);
    } catch (e) {
      console.error(`${t.padEnd(16)} ERROR`, e instanceof Error ? e.message : e);
    }
  }
  console.log("[done]");
}
main().catch((e) => { console.error(e); process.exit(1); });
