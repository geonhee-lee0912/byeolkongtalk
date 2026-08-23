// 합성 샘플(1970-2010 매일 정오) → 축별 raw 분포 → 21분위 테이블 + 분포 점검.
// run: node --import tsx scripts/saju-mbti-calibrate.mjs
import { calcSaju } from "../lib/saju/calc.ts";
import { yinYangRaw, strengthRaw, wealthRaw, nurtureRaw } from "../lib/saju-mbti/mapping.ts";

const raws = { yinYang: [], strength: [], wealth: [], nurture: [] };
for (let y = 1970; y <= 2010; y++) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const s = calcSaju({ year: y, month: m, day: d, hour: 12, minute: 0, gender: "other" });
      raws.yinYang.push(yinYangRaw(s));
      raws.strength.push(strengthRaw(s));
      raws.wealth.push(wealthRaw(s));
      raws.nurture.push(nurtureRaw(s));
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

const table = {};
for (const k of Object.keys(raws)) table[k] = quantiles(raws[k]);
console.log("샘플 수:", raws.yinYang.length);
console.log("QUANTILE_TABLE =", JSON.stringify(table, null, 2));

for (const k of Object.keys(raws)) {
  const med = table[k][10];
  const front = raws[k].filter((v) => v >= med).length;
  console.log(`${k}: 앞극 ${(100 * front / raws[k].length).toFixed(1)}%`);
}
