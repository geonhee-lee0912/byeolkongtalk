// 사용: node --import tsx scripts/api-cost-allocate.ts <q9.json 경로> <콘솔총액USD>
// 예:   node --import tsx scripts/api-cost-allocate.ts "$SCRATCH/q9.json" 72.8
//
// 콘솔 총액(Sonnet 분)을 리딩별 점수 비중으로 배분하고, 캐시 히트율 3 시나리오로
// 상품 순위가 뒤집히는지 확인한다. haiku 분($2.8)은 요약·민감판정이라 별도 트랙.
//
// 총액은 진실이고 배분만 추정이다. 총액 인플레는 모든 행에 비례로 퍼지므로
// 순위·점유율은 총액 오차에 불변, 절대 금액(건당$·마진₩)만 함께 움직인다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreReading, allocate, type Turn, type CostTrack } from "../lib/analytics/apiCost.ts";

type Row = {
  id: string;
  /** 'report' = 운세 one-shot(assistant 1건) / 'chat' = 대화형 */
  kind: "report" | "chat";
  /** 상품 라벨 — Q9 에서 확정(fortune 센티넬 > relationship > spread_type > saju_product) */
  product: string;
  /** 페르소나 트랙 키 — 'fortune' | 'tarot' | 'saju' | 'relationship' */
  persona: string;
  consultation_type: string;
  stars_spent: number;
  d: string;
  turns: Turn[];
};

const [, , path, totalArg] = process.argv;
if (!path || !totalArg) {
  console.error("사용: node --import tsx scripts/api-cost-allocate.ts <q9.json> <총액USD>");
  process.exit(1);
}
const rows: Row[] = JSON.parse(readFileSync(path, "utf8"));
const TOTAL = Number(totalArg);

const HIT_RATES = [0.3, 0.6, 0.9];
const BASELINE_HIT = 0.6;
const USD_KRW = 1400;
/** 유상 별당 매출 = 누적 결제 ₩107,900 / 유상 지급 1,180별 (A1·A2 실측) */
const WON_PER_STAR = 91.44;
/** A2 실측 — 소비 11,285별 중 무료 별 소비 10,543별 */
const FREE_SPEND_SHARE = 0.934;
/** A1 실측 — 완료 결제 52건 누적 매출. 52건 전부 7월분이라 원가창(7/01~7/25)과 정합 */
const ACTUAL_REVENUE_KRW = 107_900;

// ── 페르소나 정적 블록 실측 글자수 ────────────────────────────────────────────
// 파일을 직접 읽어 lib 소스와 동일하게 합성한다(하드코딩 상수는 페르소나 수정 시 드리프트).
// 근거(추측 아님):
//   lib/claude.ts getPersona()            = core + SEP + byeolkong_saju.md          → saju 대화
//   lib/claude.ts getTarotPersona()       = core + SEP + byeolkong_tarot.md         → tarot 대화
//   lib/claude.ts getRelationshipPersona()= core + SEP + byeolkong_relationship.md  → relationship 스레드
//   lib/fortune/prompt.ts getFortunePersona() = byeolkong_fortune.md 단독(코어 없음) → 운세 one-shot
// ⚠️ 운세 리포트만 코어를 안 붙인다 — 정적 블록이 한 자리 수 배로 작다.
// verdict_inthread·relationship_draw 가이드는 dynamicPart(캐시 미마킹)라 정적분에서 제외.
const SEP = "\n\n---\n\n";
const P = (f: string) => readFileSync(join(process.cwd(), "data", "persona", f), "utf-8");
const CORE = P("byeolkong_core.md");
const SYSTEM_CHARS: Record<string, number> = {
  saju: (CORE + SEP + P("byeolkong_saju.md")).length,
  tarot: (CORE + SEP + P("byeolkong_tarot.md")).length,
  relationship: (CORE + SEP + P("byeolkong_relationship.md")).length,
  fortune: P("byeolkong_fortune.md").length,
};

function trackOf(persona: string): CostTrack {
  // 연애 스레드만 최근 24메시지 + rolling_summary 창(lib/relationship/memory.ts)
  return persona === "relationship" ? "windowed" : "full_history";
}

type Agg = { usd: number; n: number; stars: number };
const fmt = (n: number, d = 0) => n.toLocaleString("ko-KR", { maximumFractionDigits: d });

/** 한 시나리오의 상품별 집계 */
function runScenario(hit: number) {
  const scored = rows.map((r) => ({
    ...r,
    ...scoreReading({
      turns: r.turns,
      systemChars: SYSTEM_CHARS[r.persona] ?? SYSTEM_CHARS.tarot,
      track: trackOf(r.persona),
      windowMsgs: 24,
      summaryChars: 1_200,
      cacheHitRate: hit,
    }),
  }));
  const alloc = allocate(scored, TOTAL);

  const byProduct = new Map<string, Agg>();
  const byKind = new Map<string, Agg>();
  for (const a of alloc) {
    for (const [map, key] of [
      [byProduct, a.product],
      [byKind, a.kind],
    ] as const) {
      const cur = map.get(key) ?? { usd: 0, n: 0, stars: 0 };
      cur.usd += a.usd;
      cur.n += 1;
      cur.stars += Number(a.stars_spent ?? 0);
      map.set(key, cur);
    }
  }
  return { byProduct, byKind };
}

console.log("=== 페르소나 정적 블록 실측 글자수 (SYSTEM_CHARS) ===");
for (const [k, v] of Object.entries(SYSTEM_CHARS)) {
  console.log(`  ${k.padEnd(14)}${String(v).padStart(7)}자`);
}
console.log(
  `  (core ${CORE.length}자 + 구분자 ${SEP.length}자 + 도메인 파일. fortune 은 코어 없이 단독)`
);
console.log(`\n리딩 ${rows.length}건 / 턴 ${rows.reduce((a, r) => a + r.turns.length, 0)}개 / 배분 총액 $${TOTAL}`);

const rankings = new Map<number, string[]>();
const scenarios = new Map<number, ReturnType<typeof runScenario>>();

for (const hit of HIT_RATES) {
  const s = runScenario(hit);
  scenarios.set(hit, s);

  console.log(`\n=== 캐시 히트율 ${hit} — 총 $${TOTAL} 배분 ===`);
  console.log(
    "상품".padEnd(24) + "건수".padStart(6) + "원가$".padStart(9) + "건당$".padStart(9) +
    "별소모".padStart(8) + "별당원가₩".padStart(11)
  );
  const sorted = [...s.byProduct.entries()].sort((a, b) => b[1].usd - a[1].usd);
  for (const [k, v] of sorted) {
    const perReading = v.usd / v.n;
    const wonPerStar = v.stars > 0 ? (v.usd * USD_KRW) / v.stars : 0;
    console.log(
      k.padEnd(24) + String(v.n).padStart(6) + v.usd.toFixed(2).padStart(9) +
      perReading.toFixed(4).padStart(9) + String(v.stars).padStart(8) +
      wonPerStar.toFixed(1).padStart(11)
    );
  }
  // 게이트 1 — 배분 총합이 목표와 일치해야 한다.
  const sum = sorted.reduce((a, [, v]) => a + v.usd, 0);
  console.log(`검산: 배분 총합 $${sum.toFixed(6)} (목표 $${TOTAL})`);

  // 게이트 2 재료 — 건당$ 내림차순 상품 순위
  rankings.set(
    hit,
    [...s.byProduct.entries()].sort((a, b) => b[1].usd / b[1].n - a[1].usd / a[1].n).map(([k]) => k)
  );
}

// ── 게이트 2: 건당$ 순위 안정성 ───────────────────────────────────────────────
// 위치 비교(i번째가 같은가)는 중간에 한 상품이 끼어들면 그 아래 전부를 "뒤집힘"으로
// 오계상한다. 순위 뒤집힘의 정의는 쌍의 상대순서가 바뀌는 것 → discordant pair 로 센다.
console.log(`\n=== 게이트 2: 건당$ 순위 안정성 (히트율 ${HIT_RATES.join("/")}) ===`);
const nOf = (k: string) => scenarios.get(BASELINE_HIT)!.byProduct.get(k)!.n;
const perOf = (hit: number, k: string) => {
  const v = scenarios.get(hit)!.byProduct.get(k)!;
  return v.usd / v.n;
};
for (const minN of [1, 5]) {
  const keys = rankings.get(HIT_RATES[0])!.filter((k) => nOf(k) >= minN);
  const flips: string[] = [];
  let pairs = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs += 1;
      // 기준 시나리오에서 i가 j보다 비쌌다(정렬 순서). 다른 시나리오에서 뒤집히는지.
      for (const hit of HIT_RATES.slice(1)) {
        if (perOf(hit, keys[i]) < perOf(hit, keys[j])) {
          const gap0 = ((perOf(HIT_RATES[0], keys[i]) / perOf(HIT_RATES[0], keys[j])) - 1) * 100;
          const gapN = ((perOf(hit, keys[i]) / perOf(hit, keys[j])) - 1) * 100;
          flips.push(
            `${keys[i]} vs ${keys[j]} — 히트율 ${HIT_RATES[0]}에서 +${gap0.toFixed(1)}% → ${hit}에서 ${gapN.toFixed(1)}%`
          );
        }
      }
    }
  }
  console.log(
    `  n>=${minN}: 상품 ${keys.length}개 / 비교쌍 ${pairs}개 → ` +
    (flips.length === 0 ? "역전 0건 (캐시 가정에 강건)" : `역전 ${flips.length}건`)
  );
  for (const f of flips) console.log(`    - ${f}`);
}
// 캐시 히트율이 올라갈 때 어느 방향으로 원가가 이동하는지 (역전의 구조적 원인)
console.log(`\n  캐시 히트율 ${HIT_RATES[0]} → ${HIT_RATES[HIT_RATES.length - 1]} 원가 이동 (정적블록 큰 상품이 유리해짐)`);
const lo = scenarios.get(HIT_RATES[0])!.byProduct;
const hi = scenarios.get(HIT_RATES[HIT_RATES.length - 1])!.byProduct;
const moves = [...lo.entries()]
  .map(([k, v]) => ({ k, lo: v.usd, hi: hi.get(k)!.usd, pct: (hi.get(k)!.usd / v.usd - 1) * 100 }))
  .sort((a, b) => a.pct - b.pct);
for (const m of [...moves.slice(0, 3), ...moves.slice(-3)]) {
  console.log(
    `    ${m.k.padEnd(24)}$${m.lo.toFixed(2).padStart(6)} → $${m.hi.toFixed(2).padStart(6)}  ${m.pct >= 0 ? "+" : ""}${m.pct.toFixed(1)}%  (정적 ${SYSTEM_CHARS[rows.find((r) => r.product === m.k)!.persona]}자)`
  );
}

// ── A. 상품별 마진 ───────────────────────────────────────────────────────────
// 매출 = stars_spent × 유상 별당 매출(₩91.44). 무료 별로 태운 리딩도 같은 단가로 환산하면
// 매출이 과대계상되므로, 여기 매출은 "정가로 팔렸다면" 기준의 명목 매출이다(B 에서 보정).
const baseline = scenarios.get(BASELINE_HIT)!;
console.log(`\n=== A. 상품별 마진 (히트율 ${BASELINE_HIT} / 명목매출 = 별소모 × ₩${WON_PER_STAR}) ===`);
console.log(
  "상품".padEnd(24) + "건수".padStart(6) + "매출₩".padStart(11) + "원가₩".padStart(10) +
  "마진₩".padStart(11) + "마진율%".padStart(9)
);
const margins = [...baseline.byProduct.entries()]
  .map(([k, v]) => {
    const rev = v.stars * WON_PER_STAR;
    const cost = v.usd * USD_KRW;
    return { k, n: v.n, rev, cost, margin: rev - cost, rate: rev > 0 ? ((rev - cost) / rev) * 100 : -Infinity };
  })
  .sort((a, b) => a.margin - b.margin);
for (const m of margins) {
  console.log(
    m.k.padEnd(24) + String(m.n).padStart(6) + fmt(m.rev).padStart(11) + fmt(m.cost).padStart(10) +
    fmt(m.margin).padStart(11) + (m.rev > 0 ? m.rate.toFixed(1) : "무료").padStart(9)
  );
}
const tot = margins.reduce((a, m) => ({ rev: a.rev + m.rev, cost: a.cost + m.cost }), { rev: 0, cost: 0 });
console.log(
  "합계".padEnd(24) + String(rows.length).padStart(6) + fmt(tot.rev).padStart(11) +
  fmt(tot.cost).padStart(10) + fmt(tot.rev - tot.cost).padStart(11) +
  (((tot.rev - tot.cost) / tot.rev) * 100).toFixed(1).padStart(9)
);
const losers = margins.filter((m) => m.margin < 0);
console.log(
  `적자 상품 ${losers.length}개 / 적자 합 ₩${fmt(losers.reduce((a, m) => a + m.margin, 0))}` +
  (losers.length ? ` → ${losers.map((m) => m.k).join(", ")}` : "")
);
// 실현 현금과의 대조 — 위 "명목매출"은 소비된 별이 전부 유상이었다면의 값이다.
// 실제로는 소비 별의 93.4% 가 무료라, 현금 기준으로는 아래가 진짜 그림이다.
// 결제 52건 전부 7월분(payments 7/01~ = 누적과 동일) → 원가창(7/01~7/25)과 정합.
console.log(
  `\n  [실현 현금 대조] 실매출 ₩${fmt(ACTUAL_REVENUE_KRW)} vs 배분 API 원가 ₩${fmt(tot.cost)} ` +
  `→ API 원가가 매출의 ${((tot.cost / ACTUAL_REVENUE_KRW) * 100).toFixed(1)}%`
);
console.log(
  `  명목매출 ₩${fmt(tot.rev)} 은 실매출의 ${(tot.rev / ACTUAL_REVENUE_KRW).toFixed(1)}배 ` +
  `— 소비 별의 ${(FREE_SPEND_SHARE * 100).toFixed(1)}% 가 무료라서 벌어진 격차. 위 마진율은 "정가로 다 팔렸다면" 기준.`
);

// ── B. 무료 별로 태운 원가 근사 ───────────────────────────────────────────────
// 리딩별 "무료/유상 결제 여부" 판정은 이 태스크 범위 밖 → 총액에 A2 의 무료 소비 비중을 곱한 근사.
console.log(`\n=== B. 무료 별로 태운 원가 (근사) ===`);
console.log(
  `  총 배분 원가 ₩${fmt(tot.cost)} × 무료 소비 비중 ${(FREE_SPEND_SHARE * 100).toFixed(1)}% ` +
  `= ₩${fmt(tot.cost * FREE_SPEND_SHARE)} (매출 없이 태운 원가)`
);
console.log(`  유상 소비 대응 원가 ≈ ₩${fmt(tot.cost * (1 - FREE_SPEND_SHARE))}`);
console.log(`  ⚠️ 근사: 리딩별 결제 재원(무료/유상)을 가르지 않고 총액에 A2 비중을 곱한 값.`);

// ── C. 운세 one-shot vs 대화형 ───────────────────────────────────────────────
// report/chat 비율이 정확히 캐시 가정에 민감한 값이라(정적블록 678자 vs 16,598자)
// 3 시나리오 전부 찍어서 결론이 유지되는지 본다.
console.log(`\n=== C. 운세 one-shot(report) vs 대화형(chat) ===`);
console.log(
  "히트율".padEnd(8) + "구분".padEnd(9) + "건수".padStart(6) + "원가$".padStart(9) +
  "건당$".padStart(9) + "건당₩".padStart(8) + "별소모".padStart(8) + "건당별".padStart(8) +
  "별당원가₩".padStart(11)
);
for (const hit of HIT_RATES) {
  const bk = scenarios.get(hit)!.byKind;
  for (const [k, v] of [...bk.entries()].sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(
      String(hit).padEnd(8) + k.padEnd(9) + String(v.n).padStart(6) + v.usd.toFixed(2).padStart(9) +
      (v.usd / v.n).toFixed(4).padStart(9) + fmt((v.usd / v.n) * USD_KRW).padStart(8) +
      String(v.stars).padStart(8) + (v.stars / v.n).toFixed(1).padStart(8) +
      (v.stars > 0 ? ((v.usd * USD_KRW) / v.stars).toFixed(1) : "-").padStart(11)
    );
  }
  const c = bk.get("chat")!;
  const r = bk.get("report")!;
  console.log(
    `        → 별당원가 배수 chat/report = ${((c.usd / c.stars) / (r.usd / r.stars)).toFixed(2)}배` +
    `, 건당원가 배수 = ${((c.usd / c.n) / (r.usd / r.n)).toFixed(2)}배`
  );
}
