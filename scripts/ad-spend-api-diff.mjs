// scripts/ad-spend-api-diff.mjs — 광고비 전체 재수집 전/후 대조 (읽기 전용).
// prod ad_spend(Meta) 날짜 합계  vs  Meta API 광고 단위 합계  vs  Meta API 계정 단위 합계.
// 광고 단위 ≠ 계정 단위인 날이 있으면 삭제·보관된 광고가 level=ad 에서 빠진 것이다(스펙 §10).
// 사용: node scripts/ad-spend-api-diff.mjs [from] [to]   (기본: prod 최소 spend_date ~ 어제 KST)
// env: .env.local 의 SUPABASE_PAT · META_ADS_ACCESS_TOKEN · META_AD_ACCOUNT_ID
// 🔴 토큰·요청 URL 을 출력하지 않는다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => /^(SUPABASE_PAT|META_ADS_ACCESS_TOKEN|META_AD_ACCOUNT_ID)=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const PROD_REF = "etczntmzobherqyjoyvj";
const V = "v23.0";

async function prodQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
  });
  if (!res.ok) throw new Error(`prod query HTTP ${res.status}`);
  return res.json();
}

async function insightsByDay(level, from, to) {
  const p = new URLSearchParams({
    level, time_increment: "1", time_range: JSON.stringify({ since: from, until: to }),
    fields: "date_start,spend", limit: "500", access_token: env.META_ADS_ACCESS_TOKEN,
  });
  let url = `https://graph.facebook.com/${V}/act_${env.META_AD_ACCOUNT_ID}/insights?${p}`;
  const by = {};
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(`Meta ${level}: code ${j.error.code} ${j.error.message}`);
    for (const x of j.data) by[x.date_start] = (by[x.date_start] ?? 0) + Number(x.spend);
    url = j.paging?.next ?? null;
  }
  return by;
}

const yesterday = new Date(Date.now() + 9 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
let [from, to] = process.argv.slice(2);
if (!from) from = (await prodQuery("select min(spend_date)::text d from ad_spend where platform='meta'"))[0].d;
if (!to) to = yesterday;

const prodRows = await prodQuery(
  `select spend_date::text d, sum(spend_won)::bigint won, count(*)::int n from ad_spend
   where platform='meta' and spend_date between '${from}' and '${to}' group by 1`);
const prod = Object.fromEntries(prodRows.map((r) => [r.d, Number(r.won)]));
const adLvl = await insightsByDay("ad", from, to);
const acctLvl = await insightsByDay("account", from, to);

const days = [];
for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
  days.push(new Date(t).toISOString().slice(0, 10));
}
let tp = 0, ta = 0, tc = 0, diffDays = 0, levelGapDays = 0;
console.log("date        prod      api(ad)   api(acct)  prod-api  ad≠acct");
for (const d of days) {
  const p = prod[d] ?? null;
  const a = Math.round(adLvl[d] ?? 0);
  const c = Math.round(acctLvl[d] ?? 0);
  tp += p ?? 0; ta += a; tc += c;
  const diff = (p ?? 0) - a;
  if (diff !== 0 || p == null) diffDays++;
  if (a !== c) levelGapDays++;
  if (diff !== 0 || p == null || a !== c) {
    console.log(`${d}  ${String(p ?? "(없음)").padStart(8)}  ${String(a).padStart(8)}  ${String(c).padStart(9)}  ${String(diff).padStart(8)}  ${a !== c ? "⚠️" : ""}`);
  }
}
console.log(`\n기간 ${from}~${to} (${days.length}일) · 차이 있는 날 ${diffDays} · ad≠account ${levelGapDays}`);
console.log(`합계 prod ₩${tp.toLocaleString()} · api(ad) ₩${ta.toLocaleString()} · api(acct) ₩${tc.toLocaleString()} · prod-api ₩${(tp - ta).toLocaleString()}`);
