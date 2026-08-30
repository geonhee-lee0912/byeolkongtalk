// 신규 사주 종목 생성 스모크 — 공용 엔진 파이프라인 검증(프롬프트→생성→파싱→분량).
// Run: set -a && . ./.env.local && npx tsx scripts/fortune-generic-qa.ts
// ⚠️ 실 luna 콜 발생. 대표 종목만.
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { fortuneModel } from "@/lib/fortune/model";
import { fortuneResponseFormat } from "@/lib/fortune/response-format";
import { parseGenericReportJson, needsDaeun } from "@/lib/fortune/generic-report";
import { generateOnce } from "@/lib/claude";
import { calcSaju, calcDaeun, type SajuInput } from "@/lib/saju/calc";

const BIRTH: SajuInput = { year: 1994, month: 5, day: 12, hour: 9, minute: 0, gender: "female" };
const TYPES: FortuneType[] = ["nature_self", "love_self", "wealth_vessel", "fact_bomb", "past_life", "element_balance", "life_full"];

function proseLen(o: unknown): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (typeof v === "string") n += v.length;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(o);
  return n;
}

async function main() {
  const saju = calcSaju(BIRTH);
  console.log(`[generic-qa] ${fortuneModel("nature_self")} · ${new Date().toISOString()}`);
  console.log("type            별  섹션  산문자수  파싱");
  for (const type of TYPES) {
    const input = needsDaeun(type) ? { saju, daeun: calcDaeun(BIRTH, 9) } : { saju };
    const system = buildFortuneSystem(type, input);
    try {
      const raw = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[type], undefined, fortuneModel(type), fortuneResponseFormat(type));
      const ai = parseGenericReportJson(raw);
      const ok = ai ? "OK" : "❌FAIL";
      const secs = ai ? ai.sections.length : 0;
      const len = ai ? proseLen(ai) : raw.length;
      console.log(`${type.padEnd(16)} ${String(FORTUNE_CONFIG[type].cost).padStart(2)}  ${String(secs).padStart(4)}  ${String(len).padStart(7)}  ${ok}`);
    } catch (err) {
      console.error(`${type.padEnd(16)} ERROR`, err instanceof Error ? err.message : err);
    }
  }
  console.log("[done]");
}
main().catch((e) => { console.error("qa 실패:", e); process.exit(1); });
