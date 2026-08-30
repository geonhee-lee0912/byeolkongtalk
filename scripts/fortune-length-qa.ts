// scripts/fortune-length-qa.ts — luna era 리포트 분량 QA baseline.
// Run: set -a && . ./.env.local && npx tsx scripts/fortune-length-qa.ts   (셸이 OPENAI_API_KEY 등을 process.env 로)
//
// 유료 리포트 5종을 프로덕션 경로(generateOnce + luna + 구조화출력)로 생성해 "산문 자수"를 측정한다.
// 구 fortune-length-probe.ts 는 Anthropic 직결이라 luna(OpenAI) 모델명을 못 붙인다(stale) — 그 대체.
// 목표치 = docs/superpowers/specs/2026-08-30-전상품-분량-프레임-design.md §2.
// ⚠️ 실 luna 콜 5건 발생. baseline 측정용, 반복 실행 자제.

import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { fortuneModel } from "@/lib/fortune/model";
import { fortuneResponseFormat } from "@/lib/fortune/response-format";
import { generateOnce } from "@/lib/claude";
import { calcSaju, calcTemporalLuck, type SajuInput, type SajuResult } from "@/lib/saju/calc";

const BIRTH_A: SajuInput = { year: 1994, month: 5, day: 12, hour: 9, gender: "female" };
const BIRTH_B: SajuInput = { year: 1992, month: 11, day: 3, hour: 14, gender: "male" };

// 프로덕션(app/api/fortune/create/route.ts)과 동일한 temporal 부착.
function sajuForType(type: FortuneType): SajuResult {
  const saju = calcSaju(BIRTH_A);
  if (type === "monthly") {
    saju.temporal = calcTemporalLuck(new Date(), BIRTH_A.year);
  } else if (type === "good_days") {
    saju.temporal = calcTemporalLuck(new Date(), BIRTH_A.year, { includeMonth: true });
  }
  return saju;
}

// JSON 리포트는 문자열 필드 합, 마크다운(good_days)은 raw 길이.
function proseLen(raw: string): number {
  try {
    const o = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    let n = 0;
    const walk = (v: unknown) => {
      if (typeof v === "string") n += v.length;
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(o);
    return n > 0 ? n : raw.length;
  } catch {
    return raw.length;
  }
}

// 목표 자수 (전상품-분량-프레임 §2). saju_full 은 플래그십 리워크 목표(현 프롬프트는 못 미침 — gap 예상).
const TARGET: Record<string, number> = {
  monthly: 5000,
  compat: 8000,
  compat_social: 3300,
  good_days: 0, // 캘린더로 이동 — 기록용 측정만
  saju_full: 20000,
};

const TYPES: FortuneType[] = ["monthly", "compat", "compat_social", "good_days", "saju_full"];

async function main() {
  console.log(`[fortune-length-qa] 모델=${fortuneModel("monthly")} · ${new Date().toISOString()}`);
  console.log("type           별  산문자수  목표    gap");
  for (const type of TYPES) {
    const input =
      type === "compat" || type === "compat_social"
        ? { saju: sajuForType(type), sajuB: calcSaju(BIRTH_B), names: { a: "가", b: "나" } }
        : { saju: sajuForType(type) };
    const system = buildFortuneSystem(type, input);
    try {
      const raw = await generateOnce(
        system,
        [{ role: "user", content: FORTUNE_KICKOFF }],
        MAX_TOKENS_BY_FORTUNE[type],
        undefined,
        fortuneModel(type),
        fortuneResponseFormat(type)
      );
      const prose = proseLen(raw);
      const tgt = TARGET[type] ?? 0;
      const gap = tgt > 0 ? `${prose >= tgt ? "+" : ""}${Math.round((prose / tgt - 1) * 100)}%` : "—";
      console.log(
        `${type.padEnd(14)} ${String(FORTUNE_CONFIG[type].cost).padStart(2)}  ${String(prose).padStart(6)}  ${String(tgt || "-").padStart(5)}  ${gap.padStart(6)}`
      );
    } catch (err) {
      console.error(`${type.padEnd(14)} ERROR`, err instanceof Error ? err.message : err);
    }
  }
  console.log("[done]");
}

main().catch((e) => {
  console.error("qa 실패:", e);
  process.exit(1);
});
