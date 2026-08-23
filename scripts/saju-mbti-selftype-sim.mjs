// 무작위 응답 대량 → 자아 16유형 분포 + 축별 부축흘림 총량 진단. (dev)
// run: node --import tsx scripts/saju-mbti-selftype-sim.mjs
import { QUESTIONS } from "../lib/saju-mbti/questions.ts";
import { selfType } from "../lib/saju-mbti/self-type.ts";

// 흘림 총량(축별 +1 슬롯 수)
const spill = { yinYang: 0, strength: 0, wealth: 0, nurture: 0 };
const POLE_AXIS = { 양: "yinYang", 음: "yinYang", 강: "strength", 유: "strength", 재: "wealth", 인: "wealth", 생: "nurture", 단: "nurture" };
for (const q of QUESTIONS) for (const o of q.options) for (const [pole, w] of Object.entries(o.weights)) {
  if (w === 1) spill[POLE_AXIS[pole]]++;
}
console.log("축별 부축 흘림 슬롯:", spill);

const N = 50000;
const count = {};
// 결정적 의사난수(시드) — Date/Math.random 없이 재현 가능
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < N; i++) {
  const ans = {};
  for (const q of QUESTIONS) ans[q.id] = q.options[Math.floor(rnd() * 4)].id;
  const code = selfType(ans).code;
  count[code] = (count[code] || 0) + 1;
}
const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
console.log("\n무작위 응답 자아 16유형 분포:");
for (const [c, n] of sorted) console.log(`  ${c}: ${(100 * n / N).toFixed(1)}%`);
console.log("유형 수:", sorted.length, "/ 최대:", (100 * sorted[0][1] / N).toFixed(1) + "%");
