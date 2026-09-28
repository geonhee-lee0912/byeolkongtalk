// 별마루 "우리 오늘" 톤 분포 측정 — 스펙 §3-1. **읽기 전용·findings 전용**.
// 🔴 pair-day.ts · day-score.ts 를 고치지 않는다. 실물에서 본 "30일 중 13일 금색"은 한 쌍(n=1)이라
//    분포를 모른다 — 임계값만 올리면 baseline 낮은 쌍은 금색이 영영 0일이 될 수 있다(스펙 경고).
//    그래서 고치기 전에 전수에 가까운 표본으로 분포부터 잰다.
//
// 🔴 대안 비교에는 현행 공식의 **복제**가 필요하다(가중치가 pair-day.ts 모듈 private 이라 주입 불가).
//    복제는 조용히 드리프트하므로, 시뮬 전에 복제본이 진짜 buildPairCalendar 와 **셀 단위로 동일**한지
//    단정하고 불일치면 즉시 throw 한다. 이 단정이 없으면 아래 표 전체가 무의미해진다.
//
// 실행: node --import tsx scripts/byeolmaru-pair-tone-freq.ts
//
// ⚠️ 2026-09-20 이후 pair-day.ts 는 V4(가중 + baseline 제거)다. 이 스크립트의 V0 은 **옛 공식**이라
//    대조 단정이 깨진다 — V0 을 현행 공식(=V4)으로 바꾸고 돌리거나, 과거 비교용이면 단정을 끌 것.
import { calcSaju, calcTemporalLuck, baseDateForKst, type SajuResult, type DailyLuck } from "@/lib/saju/calc";
import { buildPairCalendar, pairBackdrop } from "@/lib/byeolmaru/pair-day";
import { dayFactors, dayScore } from "@/lib/byeolmaru/day-score";
import { toDaySelf } from "@/lib/byeolmaru/calendar";
import { heavenlyCombo, earthlySixCombo, earthlySixClash } from "@/lib/saju/pairing";

const TODAY = "2026-09-20";

// ── 현행 상수 복제 (정본 = lib/byeolmaru/pair-day.ts · day-score.ts) ──────────
// 아래 assertReplica() 가 이 값들이 정본과 같은 결과를 내는지 실제로 대조한다.
const SPARK_W = 12;
const BOND_W = 9;
const FRICTION_W = -14;
const BASELINE_SPARK_W = 4;
const BASELINE_BOND_W = 4;
const BASELINE_HARMONY_W = 2;
const GOOD_AT = 70; // 나 탭(dayGrade)과 같은 눈금 — §3-1 이 지목한 3번 원인
const NORMAL_AT = 45;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── 표본 ────────────────────────────────────────────────────────────────────
// 일주는 달력일이 하루 지날 때마다 60갑자를 정확히 1씩 순회한다 → 연속 60일을 생일로 쓰면
// 일간 10종·일지 12종이 완전히 고르게 섞인다(byeolmaru-label-freq.ts 와 같은 기법).
// 시(時) 3종으로 같은 일주라도 오행분포·scarcity 가 갈리게 한다. 23시는 야자시라 제외.
const HOURS = [6, 12, 21];
const BASE_DATE = new Date(2000, 0, 1);

function sampleBirths() {
  const out: { year: number; month: number; day: number; hour: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() + i);
    for (const hour of HOURS) out.push({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour });
  }
  return out;
}

// dailyLuck 은 그날의 간지 — 생년과 무관하다(calcTemporalLuck 은 baseDate 로만 만든다). 한 번만 만들어 공유.
const temporal = calcTemporalLuck(baseDateForKst(TODAY), 2000, { includeMonth: true });
const DAYS: DailyLuck[] = temporal.dailyLuck ?? [];
if (DAYS.length === 0) throw new Error("dailyLuck 이 비었다 — 표본을 만들 수 없다");

interface Person {
  saju: SajuResult;
  solo: number[]; // 그날 나 혼자 점수(dayScore)
  spark: boolean[];
  bond: boolean[];
  friction: boolean[];
}

const people: Person[] = sampleBirths().map((b) => {
  const saju = calcSaju({ ...b, isLunar: false, gender: "other" });
  const self = toDaySelf(saju);
  const solo: number[] = [];
  const spark: boolean[] = [];
  const bond: boolean[] = [];
  const friction: boolean[] = [];
  for (const d of DAYS) {
    solo.push(dayScore(dayFactors(self, { stem: d.stem, branch: d.branch, element: d.element })));
    spark.push(heavenlyCombo(d.stem, saju.dayStem));
    bond.push(earthlySixCombo(d.branch, saju.pillars.day.branch));
    friction.push(earthlySixClash(d.branch, saju.pillars.day.branch));
  }
  return { saju, solo, spark, bond, friction };
});

// ── 변형 정의 ───────────────────────────────────────────────────────────────
interface Variant {
  name: string;
  weightSparkBond: boolean; // OR → 가중(둘 다 full · 한 명 절반)
  weightFriction: boolean;
  useBaseline: boolean;
  goodAt: number;
  normalAt: number;
}

const V: Variant[] = [
  { name: "V0 현행", weightSparkBond: false, weightFriction: false, useBaseline: true, goodAt: 70, normalAt: 45 },
  { name: "V1 가중(끌림·결속)", weightSparkBond: true, weightFriction: false, useBaseline: true, goodAt: 70, normalAt: 45 },
  { name: "V2 가중(3종 전부)", weightSparkBond: true, weightFriction: true, useBaseline: true, goodAt: 70, normalAt: 45 },
  { name: "V3 baseline 제외", weightSparkBond: false, weightFriction: false, useBaseline: false, goodAt: 70, normalAt: 45 },
  { name: "V4 = V1+V3", weightSparkBond: true, weightFriction: false, useBaseline: false, goodAt: 70, normalAt: 45 },
  { name: "V5 = V2+V3", weightSparkBond: true, weightFriction: true, useBaseline: false, goodAt: 70, normalAt: 45 },
];

function pairScore(a: Person, b: Person, di: number, baseline: number, v: Variant): number {
  const base = (a.solo[di] + b.solo[di]) / 2;
  const nSpark = (a.spark[di] ? 1 : 0) + (b.spark[di] ? 1 : 0);
  const nBond = (a.bond[di] ? 1 : 0) + (b.bond[di] ? 1 : 0);
  const nFric = (a.friction[di] ? 1 : 0) + (b.friction[di] ? 1 : 0);
  const f = (n: number, w: number, weighted: boolean) => (weighted ? w * (n / 2) : n > 0 ? w : 0);
  return clamp(
    base +
      f(nSpark, SPARK_W, v.weightSparkBond) +
      f(nBond, BOND_W, v.weightSparkBond) +
      f(nFric, FRICTION_W, v.weightFriction) +
      (v.useBaseline ? baseline : 0)
  );
}

function baselineOf(a: SajuResult, b: SajuResult): number {
  const bd = pairBackdrop(a, b);
  return (bd.spark ? BASELINE_SPARK_W : 0) + (bd.bond ? BASELINE_BOND_W : 0) + bd.harmony * BASELINE_HARMONY_W;
}

// ── 대조 단정: 복제본 == 정본 ────────────────────────────────────────────────
function assertReplica() {
  let checked = 0;
  for (let i = 0; i < people.length; i += 17) {
    for (let j = i + 1; j < people.length; j += 23) {
      const a = people[i];
      const b = people[j];
      const real = buildPairCalendar(a.saju, b.saju, DAYS, TODAY);
      const bl = baselineOf(a.saju, b.saju);
      for (let d = 0; d < DAYS.length; d++) {
        const mine = pairScore(a, b, d, bl, V[0]);
        if (mine !== real[d].score) {
          throw new Error(
            `복제 드리프트 — 쌍(${i},${j}) ${real[d].date}: 복제 ${mine} ≠ 정본 ${real[d].score}. ` +
              `pair-day.ts 의 가중치/공식이 바뀌었다. 이 스크립트 상수를 맞춘 뒤 다시 돌릴 것.`
          );
        }
        checked++;
      }
    }
  }
  console.log(`✔ 대조 단정 통과 — 복제본이 buildPairCalendar 와 ${checked.toLocaleString()}칸 전부 일치`);
}
assertReplica();

// ── 집계 ────────────────────────────────────────────────────────────────────
const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : "0.0");

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx];
}

function describe(perUnit: number[]) {
  const s = [...perUnit].sort((x, y) => x - y);
  const mean = s.reduce((t, n) => t + n, 0) / (s.length || 1);
  return {
    mean,
    p10: quantile(s, 0.1),
    median: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    zero: s.filter((n) => n === 0).length / (s.length || 1),
    heavy: s.filter((n) => n >= 10).length / (s.length || 1), // 30일 중 10일 이상 금색 = "과다" 판정선
  };
}

// 솔로(나 탭) 기준선
const soloGoodPerPerson = people.map((p) => p.solo.filter((s) => s >= GOOD_AT).length);
const soloCells = people.length * DAYS.length;
let soloGood = 0;
let soloNormal = 0;
let soloCaution = 0;
for (const p of people)
  for (const s of p.solo) {
    if (s >= GOOD_AT) soloGood++;
    else if (s >= NORMAL_AT) soloNormal++;
    else soloCaution++;
  }

console.log(
  `\n표본: ${people.length}명(60갑자×${HOURS.length}시간대) · ${DAYS.length}일 · 쌍 ${((people.length * (people.length - 1)) / 2).toLocaleString()}개 (${TODAY} 기준)`
);
console.log(`\n■ 나 탭(솔로) 기준선 — ${soloCells.toLocaleString()}칸`);
console.log(
  `  칸 톤: 잘맞는 ${pct(soloGood, soloCells)}% · 무난 ${pct(soloNormal, soloCells)}% · 챙길 ${pct(soloCaution, soloCells)}%`
);
{
  const d = describe(soloGoodPerPerson);
  console.log(
    `  1인 30일 중 금색: 평균 ${d.mean.toFixed(1)}일 · 중앙 ${d.median} · p10 ${d.p10} · p90 ${d.p90} · 0일인 사람 ${(d.zero * 100).toFixed(1)}% · 10일↑ ${(d.heavy * 100).toFixed(1)}%`
  );
}

// 페어 — 변형별
interface Agg {
  good: number;
  normal: number;
  caution: number;
  cells: number;
  goldPerPair: number[];
}

const aggs: Agg[] = V.map(() => ({ good: 0, normal: 0, caution: 0, cells: 0, goldPerPair: [] }));

// 원인 분해용
const baselineHist: Record<number, number> = {};
let sparkCells = 0;
let sparkBoth = 0;
let bondCells = 0;
let bondBoth = 0;
let fricCells = 0;
let fricBoth = 0;
let soloSparkCells = 0;
let soloBondCells = 0;
let soloFricCells = 0;
for (const p of people)
  for (let d = 0; d < DAYS.length; d++) {
    if (p.spark[d]) soloSparkCells++;
    if (p.bond[d]) soloBondCells++;
    if (p.friction[d]) soloFricCells++;
  }

// 임계 스캔 대상(V0 · V4)
const SCAN_AT = [65, 70, 75, 78, 80, 82, 85, 88];
const scan: Record<string, Record<number, number[]>> = { "V0 현행": {}, "V4 = V1+V3": {} };
for (const k of Object.keys(scan)) for (const t of SCAN_AT) scan[k][t] = [];

for (let i = 0; i < people.length; i++) {
  for (let j = i + 1; j < people.length; j++) {
    const a = people[i];
    const b = people[j];
    const bl = baselineOf(a.saju, b.saju);
    baselineHist[bl] = (baselineHist[bl] ?? 0) + 1;

    const gold = V.map(() => 0);
    const scanGold: Record<string, Record<number, number>> = {
      "V0 현행": Object.fromEntries(SCAN_AT.map((t) => [t, 0])),
      "V4 = V1+V3": Object.fromEntries(SCAN_AT.map((t) => [t, 0])),
    };

    for (let d = 0; d < DAYS.length; d++) {
      const ns = (a.spark[d] ? 1 : 0) + (b.spark[d] ? 1 : 0);
      const nb = (a.bond[d] ? 1 : 0) + (b.bond[d] ? 1 : 0);
      const nf = (a.friction[d] ? 1 : 0) + (b.friction[d] ? 1 : 0);
      if (ns > 0) {
        sparkCells++;
        if (ns === 2) sparkBoth++;
      }
      if (nb > 0) {
        bondCells++;
        if (nb === 2) bondBoth++;
      }
      if (nf > 0) {
        fricCells++;
        if (nf === 2) fricBoth++;
      }

      for (let v = 0; v < V.length; v++) {
        const s = pairScore(a, b, d, bl, V[v]);
        aggs[v].cells++;
        if (s >= V[v].goodAt) {
          aggs[v].good++;
          gold[v]++;
        } else if (s >= V[v].normalAt) aggs[v].normal++;
        else aggs[v].caution++;

        if (v === 0 || v === 4) {
          const key = V[v].name;
          for (const t of SCAN_AT) if (s >= t) scanGold[key][t]++;
        }
      }
    }
    for (let v = 0; v < V.length; v++) aggs[v].goldPerPair.push(gold[v]);
    for (const k of Object.keys(scan)) for (const t of SCAN_AT) scan[k][t].push(scanGold[k][t]);
  }
}

console.log(`\n■ 우리 탭 — 변형별 (쌍당 ${DAYS.length}일)`);
console.log(`  ${"변형".padEnd(20)} 금색  무난  챙길  |  쌍당금색: 평균 중앙 p10 p90   0일쌍%  10일↑쌍%`);
for (let v = 0; v < V.length; v++) {
  const a = aggs[v];
  const d = describe(a.goldPerPair);
  console.log(
    `  ${V[v].name.padEnd(20)} ${pct(a.good, a.cells).padStart(5)}% ${pct(a.normal, a.cells).padStart(5)}% ${pct(a.caution, a.cells).padStart(5)}%  |  ` +
      `${d.mean.toFixed(1).padStart(5)} ${String(d.median).padStart(4)} ${String(d.p10).padStart(3)} ${String(d.p90).padStart(3)}   ` +
      `${(d.zero * 100).toFixed(1).padStart(5)}%  ${(d.heavy * 100).toFixed(1).padStart(5)}%`
  );
}

// 🔴 실물 관측(우리 13일 / 나 2일)이 분포 어디에 있나 — 스펙이 n=1 로 세운 전제의 검증.
function percentileOf(values: number[], x: number): { atOrBelow: string; atOrAbove: string } {
  const le = values.filter((n) => n <= x).length;
  const ge = values.filter((n) => n >= x).length;
  return { atOrBelow: pct(le, values.length), atOrAbove: pct(ge, values.length) };
}
{
  const obsPair = percentileOf(aggs[0].goldPerPair, 13);
  const obsSolo = percentileOf(soloGoodPerPerson, 2);
  console.log(`\n  🔴 실물 관측 위치 (현행 공식 기준)`);
  console.log(`    우리 탭 13일: 이 값 이상인 쌍 ${obsPair.atOrAbove}%  (즉 관측 쌍은 상위 ${obsPair.atOrAbove}% 안)`);
  console.log(`    나  탭  2일: 이 값 이하인 사람 ${obsSolo.atOrBelow}%  (즉 관측 본인은 하위 ${obsSolo.atOrBelow}% 안)`);
}

// 쌍당 금색 일수 히스토그램 — 평균만으론 꼬리가 안 보인다.
function histogram(values: number[], label: string) {
  const max = Math.max(...values);
  console.log(`\n  ${label} — 쌍당 금색 일수 분포`);
  for (let n = 0; n <= max; n++) {
    const c = values.filter((x) => x === n).length;
    if (c === 0) continue;
    const bar = "█".repeat(Math.max(1, Math.round((c / values.length) * 120)));
    console.log(`    ${String(n).padStart(2)}일 ${pct(c, values.length).padStart(5)}%  ${bar}`);
  }
}
histogram(aggs[0].goldPerPair, "V0 현행");
histogram(aggs[1].goldPerPair, "V1 가중(끌림·결속)");
console.log(`\n  (참고) 나 탭 1인 금색 일수 분포`);
{
  const max = Math.max(...soloGoodPerPerson);
  for (let n = 0; n <= max; n++) {
    const c = soloGoodPerPerson.filter((x) => x === n).length;
    if (c === 0) continue;
    console.log(
      `    ${String(n).padStart(2)}일 ${pct(c, soloGoodPerPerson.length).padStart(5)}%  ${"█".repeat(Math.max(1, Math.round((c / soloGoodPerPerson.length) * 120)))}`
    );
  }
}

console.log(`\n■ 원인 분해`);
const pairCells = aggs[0].cells;
console.log(
  `  끌림(천간합): 1인 ${pct(soloSparkCells, soloCells)}% → 2인 OR ${pct(sparkCells, pairCells)}% (배율 ${(sparkCells / pairCells / (soloSparkCells / soloCells)).toFixed(2)}×) · 그중 둘 다 ${pct(sparkBoth, sparkCells)}%`
);
console.log(
  `  결속(육합)  : 1인 ${pct(soloBondCells, soloCells)}% → 2인 OR ${pct(bondCells, pairCells)}% (배율 ${(bondCells / pairCells / (soloBondCells / soloCells)).toFixed(2)}×) · 그중 둘 다 ${pct(bondBoth, bondCells)}%`
);
console.log(
  `  삐걱(충)    : 1인 ${pct(soloFricCells, soloCells)}% → 2인 OR ${pct(fricCells, pairCells)}% (배율 ${(fricCells / pairCells / (soloFricCells / soloCells)).toFixed(2)}×) · 그중 둘 다 ${pct(fricBoth, fricCells)}%`
);

const totalPairs = aggs[0].goldPerPair.length;
console.log(`\n  baseline(쌍 고정 가산) 분포 — 쌍 ${totalPairs.toLocaleString()}개`);
for (const [bl, n] of Object.entries(baselineHist).sort((x, y) => Number(x[0]) - Number(y[0]))) {
  console.log(`    +${bl.padStart(2)}점  ${String(n).padStart(6)}쌍  (${pct(n, totalPairs)}%)`);
}

console.log(`\n■ 임계값 스캔 (금색 기준선만 올렸을 때)`);
for (const k of Object.keys(scan)) {
  console.log(`  ${k}`);
  for (const t of SCAN_AT) {
    const d = describe(scan[k][t]);
    console.log(
      `    ≥${t}  평균 ${d.mean.toFixed(1).padStart(5)}일 · 중앙 ${String(d.median).padStart(2)} · p10 ${String(d.p10).padStart(2)} · p90 ${String(d.p90).padStart(2)} · 0일쌍 ${(d.zero * 100).toFixed(1).padStart(5)}% · 10일↑쌍 ${(d.heavy * 100).toFixed(1).padStart(5)}%`
    );
  }
}
