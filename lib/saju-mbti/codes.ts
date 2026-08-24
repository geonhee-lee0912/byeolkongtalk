import { POLES } from "./constants.ts";

// 16 코드 = 4축 극의 곱(음양·강유·재인·생단 순). A/B code 조립 규칙과 동일.
export const ALL_CODES: string[] = (() => {
  const out: string[] = [];
  for (const y of POLES.yinYang)
    for (const s of POLES.strength)
      for (const w of POLES.wealth)
        for (const n of POLES.nurture) out.push(y + s + w + n);
  return out;
})();
