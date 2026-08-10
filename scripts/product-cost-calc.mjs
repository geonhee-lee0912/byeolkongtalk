// 상품별 API 원가 = apiCost.scoreReading 재현. SQL 집계(assistant턴·out chars·in 누적 chars) + 페르소나 정적블록.
// 사용: node scripts/... 아니라 프로젝트 루트에서 node <이 파일> <product-token.json>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const SEP = "\n\n---\n\n";
const P = (f) => readFileSync(join(process.cwd(), "data", "persona", f), "utf-8");
const CORE = P("byeolkong_core.md");
const SYS = {
  saju: (CORE + SEP + P("byeolkong_saju.md")).length,
  tarot: (CORE + SEP + P("byeolkong_tarot.md")).length,
  relationship: (CORE + SEP + P("byeolkong_relationship.md")).length,
  fortune: P("byeolkong_fortune.md").length,
};
const CHARS_PER_TOKEN = 1.6, USD_KRW = 1400, WON_PER_STAR = 91.44;
const personaOf = (p) => p.startsWith("fortune:") ? "fortune" : p.startsWith("saju") ? "saju" : p.startsWith("rel_") ? "relationship" : "tarot";

// 정가(별) — SPREAD_INFO / SAJU_READING_COST / FORTUNE_CONFIG
const PRICE = {
  "tarot:one_card":10,"tarot:two_card":15,"tarot:three_card":25,
  "tarot:relationship_5":40,"tarot:deep_feelings_5":40,"tarot:reunion_5":40,"tarot:new_love_5":40,
  "tarot:reunion_deep_7":55,"tarot:potential_7":55,"tarot:chakra_7":55,
  "tarot:checkin_6":45,"tarot:stay_or_go_6":45,"tarot:readiness_6":45,"tarot:healing_6":45,
  "saju_chat":20,
  "fortune:daily":0,"fortune:monthly":20,"fortune:saju_full":60,"fortune:compat":40,"fortune:compat_social":35,"fortune:good_days":35,
  "fortune:tarot_daily":0,"fortune:tarot_love":20,"fortune:tarot_money":20,"fortune:tarot_career":20,"fortune:tarot_relation":20,
};
const fmt = (n,d=0) => n==null ? "-" : Number(n).toLocaleString("ko-KR",{maximumFractionDigits:d});

console.log("=== 페르소나 정적블록 글자수 ===");
for (const [k,v] of Object.entries(SYS)) console.log(`  ${k.padEnd(13)}${String(v).padStart(6)}자`);
console.log(`  (core ${CORE.length}자 + SEP + 도메인. fortune 은 코어 없이 단독)`);

const HITS = [0.3, 0.6, 0.9];
for (const hit of HITS) {
  const sysMult = hit*0.1 + (1-hit)*1.25;
  console.log(`\n=== 캐시 히트율 ${hit} (sysMult ${sysMult.toFixed(3)}) — sonnet-5 $3/$15 ===`);
  console.log(
    "상품".padEnd(22)+"판".padStart(4)+"별소모".padStart(7)+"1판원가₩".padStart(10)+
    "별당원가₩".padStart(10)+"정가별".padStart(6)+"정가매출₩".padStart(10)+"마진율%".padStart(8)
  );
  const calc = rows.map(r => {
    const persona = personaOf(r.product);
    const sysChars = SYS[persona];
    const asst = Number(r.tot_asst_turns);
    const inTok = (sysChars*asst*sysMult + Number(r.tot_in_ctx_chars))/CHARS_PER_TOKEN;
    const outTok = Number(r.tot_out_chars)/CHARS_PER_TOKEN;
    const usd = inTok/1e6*3 + outTok/1e6*15;
    const won = usd*USD_KRW;
    const perReading = won/r.readings;
    const perStar = r.tot_stars>0 ? won/r.tot_stars : null;
    const price = PRICE[r.product];
    const priceRev = price!=null ? price*WON_PER_STAR : null;
    const marginRate = (priceRev!=null && priceRev>0) ? ((priceRev-perReading)/priceRev*100) : null;
    return {product:r.product, readings:r.readings, stars:r.tot_stars, perReading, perStar, price, priceRev, marginRate, won};
  }).sort((a,b)=>(b.perStar??-1)-(a.perStar??-1));
  let totWon=0, totRev=0;
  for (const c of calc) {
    totWon += c.won;
    if (c.priceRev!=null) totRev += c.priceRev * c.readings; // 정가로 다 팔렸다면
    console.log(
      c.product.padEnd(22)+String(c.readings).padStart(4)+String(c.stars).padStart(7)+
      fmt(c.perReading).padStart(10)+fmt(c.perStar,1).padStart(10)+
      (c.price==null?"-":String(c.price)).padStart(6)+fmt(c.priceRev).padStart(10)+
      (c.marginRate==null?"-":c.marginRate.toFixed(1)).padStart(8)
    );
  }
  console.log(`  ── 총 이론 원가 ₩${fmt(totWon)} · 정가로 다 팔렸다면 매출 ₩${fmt(totRev)} → 원가/매출 ${(totWon/totRev*100).toFixed(1)}%`);
}
