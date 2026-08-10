// Anthropic 콘솔 CSV 파싱 → 모델별·토큰타입별 비용, 토큰 역산, 실제 캐시 히트율, 일별(테스트 이상치).
import { readFileSync } from "node:fs";
const csv = readFileSync(process.argv[2], "utf8");
const lines = csv.trim().split(/\r?\n/).slice(1);
const rows = lines.map((l) => l.split(",").map((s) => s.trim()));
const USD_KRW = 1400;

// $/Mtok
const PRICE = {
  "Claude Sonnet 5": { input_no_cache: 3, input_cache_read: 0.3, input_cache_write_5m: 3.75, input_cache_write_1h: 6, output: 15 },
  "Claude Haiku 4.5": { input_no_cache: 0.8, input_cache_read: 0.08, input_cache_write_5m: 1, input_cache_write_1h: 1.6, output: 4 },
};

let total = 0;
const byModel = {}, byModelType = {}, byDate = {}, byDateModel = {};
for (const r of rows) {
  const [date, model, , , , , type, cost] = r;
  const c = Number(cost);
  if (!Number.isFinite(c)) continue;
  total += c;
  byModel[model] = (byModel[model] || 0) + c;
  byModelType[model] = byModelType[model] || {};
  byModelType[model][type] = (byModelType[model][type] || 0) + c;
  byDate[date] = (byDate[date] || 0) + c;
  byDateModel[date] = byDateModel[date] || {};
  byDateModel[date][model] = (byDateModel[date][model] || 0) + c;
}

console.log(`총 비용 $${total.toFixed(2)} = ₩${Math.round(total * USD_KRW).toLocaleString("ko-KR")}  (${rows.length}행, ${Object.keys(byDate).length}일)`);
for (const [m, v] of Object.entries(byModel).sort((a,b)=>b[1]-a[1])) console.log(`  ${m.padEnd(18)} $${v.toFixed(2)} (${(v/total*100).toFixed(1)}%)`);

console.log(`\n=== Sonnet 5 token_type (토큰 역산) ===`);
const s = byModelType["Claude Sonnet 5"];
let readTok = 0, writeTok = 0, noCacheTok = 0, outTok = 0;
for (const [t, c] of Object.entries(s).sort((a,b)=>b[1]-a[1])) {
  const p = PRICE["Claude Sonnet 5"][t];
  const tok = c / p * 1e6;
  console.log(`  ${t.padEnd(22)} $${c.toFixed(2).padStart(6)}  ${(tok / 1e6).toFixed(2)}M tok`);
  if (t === "input_cache_read") readTok += tok;
  else if (t.startsWith("input_cache_write")) writeTok += tok;
  else if (t === "input_no_cache") noCacheTok += tok;
  else if (t === "output") outTok += tok;
}
const inTot = readTok + writeTok + noCacheTok;
console.log(`\n  실제 캐시 히트율(정적블록) = read/(read+write) = ${(readTok / (readTok + writeTok) * 100).toFixed(1)}%`);
console.log(`  전체 입력 중 캐시서 온 비율 = read/(read+write+no_cache) = ${(readTok / inTot * 100).toFixed(1)}%`);
console.log(`  입력 토큰 ${(inTot / 1e6).toFixed(1)}M : 출력 토큰 ${(outTok / 1e6).toFixed(1)}M  (비 ${(inTot/outTok).toFixed(1)}:1)`);

console.log(`\n=== 일별 총액 (QA/테스트 이상치 식별) ===`);
for (const [d, c] of Object.entries(byDate).sort()) {
  const dm = byDateModel[d];
  const h = dm["Claude Haiku 4.5"] ? ` (haiku $${dm["Claude Haiku 4.5"].toFixed(2)})` : "";
  console.log(`  ${d}  $${c.toFixed(2).padStart(6)} = ₩${Math.round(c*USD_KRW).toLocaleString("ko-KR").padStart(7)}${h}`);
}

// 8월(광고 love 단독·QA 없음 추정)을 실유저 기준선으로
const augDates = Object.keys(byDate).filter((d) => d >= "2026-08-01");
const augTotal = augDates.reduce((a, d) => a + byDate[d], 0);
console.log(`\n  8월(${augDates.length}일) 총 $${augTotal.toFixed(2)} = 일평균 $${(augTotal/augDates.length).toFixed(2)} = ₩${Math.round(augTotal/augDates.length*USD_KRW).toLocaleString("ko-KR")}/일`);
console.log(`  30일 환산 실유저 근사 = $${(augTotal/augDates.length*30).toFixed(2)} = ₩${Math.round(augTotal/augDates.length*30*USD_KRW).toLocaleString("ko-KR")}`);
