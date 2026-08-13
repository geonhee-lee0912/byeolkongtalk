// scripts/fortune-length-probe.ts — TEMP reproduction asset. Run: npx tsx scripts/fortune-length-probe.ts
//
// 목적: 유료 운세 리포트 5종을 실제 모델(claude-sonnet-5)로 생성해 "산문 글자수"를 측정하는
// 일회성 프로브. "운세 리포트 깊이 사다리" Phase A 의 baseline 측정 도구 — 이후 태스크가
// 분량(문장 수) 조정 전/후를 이 스크립트로 비교 검증한다.
//
// ⚠️ 실제 유료 API 호출 5건 발생(비용/시간) — 반복 실행하지 말 것.
//
// temporal 부착은 타입별로 프로덕션(app/api/fortune/create/route.ts:283-291)과 동일하게 재현한다 —
// 뒤 태스크들이 이 프로브를 before/after 재실측 도구로 반복 재사용하므로 조건 정합이 중요하다.
//
// Baseline (2026-08-13 실측, temporal 정합 수정 후 1회 실행):
//   monthly        정가 20별  산문 2412자
//   compat         정가 40별  산문 1530자
//   compat_social  정가 35별  산문 1783자
//   good_days      정가 35별  산문  910자
//   saju_full      정가 60별  산문 5244자
// → 역전 확인: monthly(20별)의 산문 분량이 compat(40별)·compat_social(35별)·good_days(35별)
//   보다 길다. saju_full(60별)은 스키마 자체가 가장 큼(연간 플래그십 — self/year/monthly
//   12개월 등)이라 역전 대상에서 제외.
// ⚠️ 직전(temporal 정합 수정 전) baseline 대비: monthly/compat/compat_social/good_days 는
//   ±3~8% 편차(good_days 는 이번 수정으로 입력이 사실상 안 바뀌었는데도 845→910 로 변해 이
//   범위가 이 측정법의 순수 표본 노이즈 수준임을 시사) — 정합 수정 자체의 영향은 미미해 보인다.
//   saju_full 만 4166→5244(+26%)로 그 노이즈 밴드를 크게 벗어난다. saju_full 은 이번 수정으로
//   temporal(30일 일진 등)이 통째로 빠졌는데, SECTION_GUIDE 는 그 데이터를 참조하지 않으므로
//   "왜" 커졌는지는 확실치 않다 — n=1 실행이라 인과 확정은 어렵고, 표본이 큰 리포트라 분산 자체가
//   클 수도 있다. 다른 평범한 후보 설명: 이전(버그) baseline 은 saju_full 에 30일 dailyLuck
//   (~900자 분량의 무관 컨텍스트)을 잘못 붙이고 있었고, 이번 fix 가 그걸 제거했다 — "무관 입력
//   컨텍스트 감소"도 흔한 설명 중 하나일 뿐, 위 노이즈/분산 가설과 배타적이지 않다. 다음 태스크가
//   saju_full 분량을 다룰 때 이 변동폭을 감안할 것.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { fortuneModel } from "@/lib/fortune/model";
import { calcSaju, calcTemporalLuck, type SajuInput, type SajuResult } from "@/lib/saju/calc";

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

// 고정 테스트 생일 — 실제 calcSaju/calcTemporalLuck 호출로 매번 생성(하드코딩 아님).
const BIRTH_A: SajuInput = { year: 1994, month: 5, day: 12, hour: 9, gender: "female" };
// compat/compat_social 용 두 번째 사람 — 다른 생일. temporal 은 절대 안 붙는다(아래 참고).
const BIRTH_B: SajuInput = { year: 1992, month: 11, day: 3, hour: 14, gender: "male" };

/**
 * type 별로 프로덕션과 동일한 temporal 상태의 saju(첫 번째 사람)를 구성.
 * route.ts 원본 확인 결과(2026-08-13):
 *   - monthly : saju.temporal = calcTemporalLuck(base, year)                    — dailyLuck 없음
 *   - good_days: saju.temporal = calcTemporalLuck(base, year, {includeMonth:true}) — dailyLuck 있음
 *   - saju_full: if/else-if 어느 분기에도 안 걸려 temporal 부착 자체가 없음
 *   - compat/compat_social: 별도 if 분기(calcSaju(profileRowToSajuInput(...))만 호출) — temporal 없음
 */
function sajuForType(type: FortuneType): SajuResult {
  const saju = calcSaju(BIRTH_A);
  if (type === "monthly") {
    saju.temporal = calcTemporalLuck(new Date(), BIRTH_A.year);
  } else if (type === "good_days") {
    saju.temporal = calcTemporalLuck(new Date(), BIRTH_A.year, { includeMonth: true });
  }
  return saju;
}

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
        ? { saju: sajuForType(type), sajuB: calcSaju(BIRTH_B), names: { a: "가", b: "나" } }
        : { saju: sajuForType(type) };
    const { staticPart, dynamicPart } = buildFortuneSystem(type, input);
    try {
      const msg = await anthropic.messages.create({
        model: fortuneModel(type), // 프로덕션 라우팅(lib/fortune/model.ts)과 동일 — 유료 5종은 전부 sonnet
        max_tokens: MAX_TOKENS_BY_FORTUNE[type],
        // prod 배선(lib/claude/adapters/anthropic.ts)과 동일하게 thinking OFF —
        // 안 끄면 sonnet-5 adaptive thinking 이 max_tokens 를 잠식해 결과가 잘려 실측이 왜곡된다.
        thinking: { type: "disabled" },
        system: `${staticPart}\n\n---\n\n${dynamicPart}`,
        messages: [{ role: "user", content: FORTUNE_KICKOFF }],
      });
      // max_tokens 절단 가시성 — 잘리면 sumStringValues 가 닫는 "}" 를 못 찾아 raw.length 로
      // 조용히 폴백하는데, 그 값이 정상 측정과 똑같은 "산문 N자" 포맷으로 찍혀 오염 데이터가 안 보인다.
      // Task 3~5 에서 문장수를 올리면 정확히 이 상황이 생길 수 있어 표시해둔다.
      const truncated = msg.stop_reason === "max_tokens";
      if (truncated) {
        console.error(`⚠️ ${type} TRUNCATED (max_tokens) — 측정값 불신`);
      }
      const raw = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const prose = type === "good_days" ? raw.length : sumStringValues(raw);
      console.log(
        `${type.padEnd(14)} 정가 ${String(FORTUNE_CONFIG[type].cost).padStart(2)}별  산문 ${prose}자${truncated ? " ⚠️TRUNCATED" : ""}`
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
