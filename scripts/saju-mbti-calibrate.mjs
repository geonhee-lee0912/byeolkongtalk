// 합성 샘플(1970-2010) → 시간 앎/모름 두 인구 각각 4축 raw 분포 → 21분위 테이블 + 16유형 분포 점검.
// 정오 고정 폐기 — 오시(午, 표기상 양)를 상수로 고정하면 음양 raw 에 +1 상수 편향이 들어가 실사용자
// 음양이 한쪽(음)으로 쏠린다(리뷰 발견). 시간 앎 인구는 12시진을 고르게 섞어 표기상 음양을 상쇄한다.
// run: node --import tsx scripts/saju-mbti-calibrate.mjs
import { calcSaju } from "../lib/saju/calc.ts";
import { yinYangRaw, strengthRaw, wealthRaw, nurtureRaw, paljaType } from "../lib/saju-mbti/mapping.ts";

// 12지지 시진 대표 시각(각 지지 구간의 홀수 시 = 자시 23~1 제외 나머지 11개 구간 중앙값 근사 + 자시는 1시로 근사).
// 표기상 음양이 정확히 6:6(양간 시진 6개·음간 시진 6개)으로 섞이도록 고른 시각.
const KNOWN_HOURS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

const rawsKnown = { yinYang: [], strength: [], wealth: [], nurture: [] };
const rawsUnknown = { yinYang: [], strength: [], wealth: [], nurture: [] };

for (let y = 1970; y <= 2010; y++) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      for (const hour of KNOWN_HOURS) {
        const s = calcSaju({ year: y, month: m, day: d, hour, minute: 0, gender: "other" });
        rawsKnown.yinYang.push(yinYangRaw(s));
        rawsKnown.strength.push(strengthRaw(s));
        rawsKnown.wealth.push(wealthRaw(s));
        rawsKnown.nurture.push(nurtureRaw(s));
      }
      const su = calcSaju({ year: y, month: m, day: d, hour: null, minute: 0, gender: "other" });
      rawsUnknown.yinYang.push(yinYangRaw(su));
      rawsUnknown.strength.push(strengthRaw(su));
      rawsUnknown.wealth.push(wealthRaw(su));
      rawsUnknown.nurture.push(nurtureRaw(su));
    }
  }
}

function quantiles(arr) {
  const a = [...arr].sort((x, z) => x - z);
  const out = [];
  for (let p = 0; p <= 100; p += 5) {
    const idx = Math.min(a.length - 1, Math.round((p / 100) * (a.length - 1)));
    out.push(Number(a[idx].toFixed(4)));
  }
  return out;
}

const tableKnown = {};
const tableUnknown = {};
for (const k of Object.keys(rawsKnown)) tableKnown[k] = quantiles(rawsKnown[k]);
for (const k of Object.keys(rawsUnknown)) tableUnknown[k] = quantiles(rawsUnknown[k]);

console.log("KNOWN 샘플 수:", rawsKnown.yinYang.length);
console.log("QUANTILE_TABLE_KNOWN =", JSON.stringify(tableKnown, null, 2));
console.log("UNKNOWN 샘플 수:", rawsUnknown.yinYang.length);
console.log("QUANTILE_TABLE_UNKNOWN =", JSON.stringify(tableUnknown, null, 2));

for (const k of Object.keys(rawsKnown)) {
  const med = tableKnown[k][10];
  const front = rawsKnown[k].filter((v) => v >= med).length;
  console.log(`KNOWN ${k}: 앞극 ${(100 * front / rawsKnown[k].length).toFixed(1)}%`);
}
for (const k of Object.keys(rawsUnknown)) {
  const med = tableUnknown[k][10];
  const front = rawsUnknown[k].filter((v) => v >= med).length;
  console.log(`UNKNOWN ${k}: 앞극 ${(100 * front / rawsUnknown[k].length).toFixed(1)}%`);
}

// ---- Part B: 16유형 분포 (paljaType — 커밋된 QUANTILE_TABLE_KNOWN/UNKNOWN 사용) ----
// 위 테이블 출력을 constants.ts 에 붙여넣고 mapping.ts 가 hourKnown 기준으로 테이블을 고르게
// 반영한 뒤 재실행할 것. (첫 실행 시점엔 아직 구 코드가 남아있어 이 파트 숫자는 참고용에 불과하다.)
function reportDistribution(label, count) {
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  console.log(`\n${label} 16유형 분포:`);
  for (const [code, n] of sorted) console.log(`  ${code}: ${(100 * n / total).toFixed(1)}%`);
  console.log(`${label} 유형 수:`, sorted.length, "/ 최대:", (100 * sorted[0][1] / total).toFixed(1) + "%");
}

const knownTypeCount = {};
const unknownTypeCount = {};
for (let y = 1970; y <= 2010; y++) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      for (const hour of KNOWN_HOURS) {
        const s = calcSaju({ year: y, month: m, day: d, hour, minute: 0, gender: "other" });
        const code = paljaType(s).code;
        knownTypeCount[code] = (knownTypeCount[code] || 0) + 1;
      }
      const su = calcSaju({ year: y, month: m, day: d, hour: null, minute: 0, gender: "other" });
      const codeU = paljaType(su).code;
      unknownTypeCount[codeU] = (unknownTypeCount[codeU] || 0) + 1;
    }
  }
}
reportDistribution("KNOWN", knownTypeCount);
reportDistribution("UNKNOWN", unknownTypeCount);
