// TEMP (삭제 예정) — 티어링(luna/nano/sonnet) 재앵커. product-cost-calc.mjs 의 scoreReading 로직 +
// 프로바이더별 단가/캐시경제. 히트율은 상품별 실효 (T-1)/T (luna 대화내부 99.6% 캐시 실측 근거).
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

// 티어링 라우팅(현 dev 배선). chat=luna, 무료데일리=nano, 유료리포트+사주resume=sonnet.
const NANO = new Set(["fortune:daily", "fortune:tarot_daily"]);
function provider(p) {
  if (p.startsWith("tarot:") || p === "rel_thread" || p.startsWith("rel_")) return "luna";
  if (NANO.has(p)) return "nano";
  return "sonnet"; // saju_chat(폐쇄·default), fortune 유료 리포트, other:*
}
const PRICE_IN = { luna: 0.20, nano: 0.05, sonnet: 3 };
const PRICE_OUT = { luna: 1.20, nano: 0.40, sonnet: 15 };
const WRITE_MULT = { luna: 1.25, nano: 1.25, sonnet: 1.25 }; // 확인(OpenAI 문서): 5.6/5 도 write 1.25× — sonnet 과 동일
const READ_MULT = 0.1;

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

// 한 상품의 이론원가(won) — provider 지정. 히트율은 상품별 (turns-readings)/turns.
function costOf(r, prov) {
  const sysChars = SYS[personaOf(r.product)];
  const asst = Number(r.tot_asst_turns), readings = Number(r.readings);
  const hit = asst > 0 ? Math.max(0, (asst - readings) / asst) : 0; // 첫 턴 cold, 이후 warm
  const sysMult = hit * READ_MULT + (1 - hit) * WRITE_MULT[prov];
  const inTok = (sysChars * asst * sysMult + Number(r.tot_in_ctx_chars)) / CHARS_PER_TOKEN;
  const outTok = Number(r.tot_out_chars) / CHARS_PER_TOKEN;
  const usd = inTok / 1e6 * PRICE_IN[prov] + outTok / 1e6 * PRICE_OUT[prov];
  return { won: usd * USD_KRW, hit };
}

let totSonnet = 0, totTiered = 0;
console.log("상품".padEnd(24)+"prov".padStart(7)+"판".padStart(5)+"턴".padStart(6)+"hit%".padStart(6)+"sonnet별당₩".padStart(12)+"티어별당₩".padStart(11)+"정가".padStart(5)+"티어마진%".padStart(9));
const out = rows.map(r => {
  const prov = provider(r.product);
  const s = costOf(r, "sonnet").won;      // 전량 sonnet(기준선)
  const t = costOf(r, prov);              // 티어링
  totSonnet += s; totTiered += t.won;
  const stars = Number(r.tot_stars);
  const perStarS = stars>0 ? s/stars : null;
  const perStarT = stars>0 ? t.won/stars : null;
  const price = PRICE[r.product];
  const perReadingT = t.won/Number(r.readings);
  const margin = (price!=null && price>0) ? (price*WON_PER_STAR - perReadingT)/(price*WON_PER_STAR)*100 : null;
  return {p:r.product, prov, readings:Number(r.readings), turns:Number(r.tot_asst_turns), hit:t.hit, perStarS, perStarT, price, margin, tieredWon:t.won};
}).sort((a,b)=>b.tieredWon-a.tieredWon);
for (const c of out) {
  console.log(
    c.p.padEnd(24)+c.prov.padStart(7)+String(c.readings).padStart(5)+String(c.turns).padStart(6)+
    (c.hit*100).toFixed(0).padStart(6)+fmt(c.perStarS,1).padStart(12)+fmt(c.perStarT,2).padStart(11)+
    (c.price==null?"-":String(c.price)).padStart(5)+(c.margin==null?"-":c.margin.toFixed(1)).padStart(9)
  );
}
const r_main = totTiered / totSonnet;
console.log(`\n── 이론 총원가: sonnet 전량 ₩${fmt(totSonnet)} → 티어링 ₩${fmt(totTiered)} · 감축비율 r=${(r_main*100).toFixed(1)}% (${(1/r_main).toFixed(1)}x↓)`);

// 콘솔 실측 앵커 (findings §1·§2)
const CONSOLE_SONNET = 168770, HAIKU = 4242, CONSOLE_TOTAL = 173012;
const REVENUE = 219200, USERS = 937, CAC = 392, PG = 7200;
const REALUSER_API_MID = 137500; // 실유저분 ~₩130-145k 중앙
const newMainConsole = r_main * CONSOLE_SONNET;
const newTotalConsole = newMainConsole + HAIKU;
// 실유저: sonnet 97.5% 에 r 적용 + haiku 2.5% 유지
const realSonnet = REALUSER_API_MID * 0.975, realHaiku = REALUSER_API_MID * 0.025;
const newRealApi = r_main * realSonnet + realHaiku;
const cmOld = (REVENUE - REALUSER_API_MID - PG) / USERS;
const cmNew = (REVENUE - newRealApi - PG) / USERS;
console.log(`\n=== 콘솔 앵커 재계산 ===`);
console.log(`API 콘솔 총액: ₩${fmt(CONSOLE_TOTAL)} → 티어링 ₩${fmt(newTotalConsole)} (main ${fmt(CONSOLE_SONNET)}→${fmt(newMainConsole)} + haiku ${fmt(HAIKU)})`);
console.log(`실유저 API: ₩${fmt(REALUSER_API_MID)} → ₩${fmt(newRealApi)}`);
console.log(`기여마진/유저: ₩${cmOld.toFixed(0)} → ₩${cmNew.toFixed(0)}  ·  회수율(vs CAC ₩${CAC}): ${(cmOld/CAC*100).toFixed(0)}% → ${(cmNew/CAC*100).toFixed(0)}%`);
