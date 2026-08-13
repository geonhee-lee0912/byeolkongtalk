// scripts/fortune-length-probe.ts — TEMP reproduction asset. Run: npx tsx scripts/fortune-length-probe.ts
//
// 목적: 유료 운세 리포트 5종을 실제 모델(claude-sonnet-5)로 생성해 "산문 글자수"를 측정하는
// 일회성 프로브. "운세 리포트 깊이 사다리" Phase A 의 baseline 측정 도구 — 이후 태스크가
// 분량(문장 수) 조정 전/후를 이 스크립트로 비교 검증한다.
//
// ⚠️ 실제 유료 API 호출 5건 발생(비용/시간) — 반복 실행하지 말 것.
//
// Baseline (2026-08-13 실측, 1회 실행):
//   monthly        정가 20별  산문 2336자
//   compat         정가 40별  산문 1619자
//   compat_social  정가 35별  산문 1721자
//   good_days      정가 35별  산문  845자
//   saju_full      정가 60별  산문 4166자
// → 역전 확인: monthly(20별)의 산문 분량이 compat(40별)·compat_social(35별)·good_days(35별)
//   보다 길다 — 정가가 더 높은 세 상품이 오히려 더 짧다. saju_full(60별)은 스키마 자체가
//   가장 큼(연간 플래그십 리포트 — self/year/monthly 12개월 등)이라 역전 대상에서 제외.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { calcSaju, calcTemporalLuck, type SajuResult } from "@/lib/saju/calc";

const rawKeyValue = readFileSync(join(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("CLAUDE_API_KEY="))
  ?.slice("CLAUDE_API_KEY=".length)
  .trim();
// .env.local 값이 따옴표로 감싸져 있을 수 있음(예: CLAUDE_API_KEY="sk-ant-...") — 벗겨내지 않으면
// 따옴표 문자가 키에 섞여 들어가 401 invalid x-api-key 로 실패한다.
const key =
  rawKeyValue && rawKeyValue.length >= 2 && rawKeyValue[0] === rawKeyValue[rawKeyValue.length - 1] && (rawKeyValue[0] === '"' || rawKeyValue[0] === "'")
    ? rawKeyValue.slice(1, -1)
    : rawKeyValue;
if (!key) {
  console.error("no CLAUDE_API_KEY");
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: key });

// 고정 테스트 사주 — 실제 calcSaju/calcTemporalLuck 호출로 생성(하드코딩 아님).
// temporal.dailyLuck 을 채워둬서 good_days 프롬프트의 "[향후 30일 일진]" 목록까지 커버.
const FIXTURE: SajuResult = calcSaju({
  year: 1994,
  month: 5,
  day: 12,
  hour: 9,
  gender: "female",
});
FIXTURE.temporal = calcTemporalLuck(new Date(), 1994, { includeMonth: true });

// compat/compat_social 용 두 번째 사람 — 다른 생일.
const FIXTURE_B: SajuResult = calcSaju({
  year: 1992,
  month: 11,
  day: 3,
  hour: 14,
  gender: "male",
});

const TYPES: FortuneType[] = ["monthly", "compat", "compat_social", "good_days", "saju_full"];

function sumStringValues(rawJson: string): number {
  try {
    const o = JSON.parse(rawJson.slice(rawJson.indexOf("{"), rawJson.lastIndexOf("}") + 1));
    let n = 0;
    const walk = (v: unknown) => {
      if (typeof v === "string") n += v.length;
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(o);
    return n;
  } catch {
    return rawJson.length;
  }
}

async function main() {
  for (const type of TYPES) {
    const input =
      type === "compat" || type === "compat_social"
        ? { saju: FIXTURE, sajuB: FIXTURE_B, names: { a: "가", b: "나" } }
        : { saju: FIXTURE };
    const { staticPart, dynamicPart } = buildFortuneSystem(type, input);
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: MAX_TOKENS_BY_FORTUNE[type],
        // prod 배선(lib/claude/adapters/anthropic.ts)과 동일하게 thinking OFF —
        // 안 끄면 sonnet-5 adaptive thinking 이 max_tokens 를 잠식해 결과가 잘려 실측이 왜곡된다.
        thinking: { type: "disabled" },
        system: `${staticPart}\n\n---\n\n${dynamicPart}`,
        messages: [{ role: "user", content: FORTUNE_KICKOFF }],
      });
      const raw = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const prose = type === "good_days" ? raw.length : sumStringValues(raw);
      console.log(
        `${type.padEnd(14)} 정가 ${String(FORTUNE_CONFIG[type].cost).padStart(2)}별  산문 ${prose}자`
      );
    } catch (err) {
      console.error(`${type.padEnd(14)} ERROR`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((e) => {
  console.error("probe 실패:", e);
  process.exit(1);
});
