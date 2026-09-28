// 별마루 하루 이름·마크의 실제 30일 빈도 측정(P5-1 검증용, 읽기 전용·네트워크 없음).
// 🔴 앞선 분포 분석은 '조합 전수'라 실제 빈도가 아니다 — 천간합·육합·충은 60갑자 중 특정 짝일
//    때만 나오므로 실제 달력에선 훨씬 드물다. 이 스크립트가 그 실제 값을 잰다.
// 🔴 P5-2: 하단 "십신 × 등급 교차" 섹션은 day-label.ts 의 DAY_LINE 카피를 쓸 때 참고하는
//    수치다 — 한 줄은 톤-블라인드(등급을 모른 채 십신으로만 정해짐)라, caution 비율이 높은
//    십신에 낙관 일변도 문구를 쓰면 등급 라벨("살짝 챙길 날")과 어긋난다. day-score.ts 의
//    등급 임계(70/45)가 바뀌면 이 수치도 바뀌므로, 카피를 다시 볼 일이 있으면 먼저 재실행할 것.
// 실행: node --import tsx scripts/byeolmaru-label-freq.ts
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { buildCalendar } from "@/lib/byeolmaru/calendar";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import type { TenGod } from "@/lib/saju/pairing";

const BIRTHS = [
  { year: 1994, month: 5, day: 17, hour: 14 },
  { year: 1988, month: 11, day: 3, hour: 9 },
  { year: 2000, month: 2, day: 29, hour: 23 },
  { year: 1979, month: 8, day: 8, hour: 6 },
  { year: 2003, month: 12, day: 25, hour: 18 },
];
const TODAY = "2026-09-12";

// 10개 이름을 전부 0으로 먼저 채워둔다 — 표본에서 우연히 0회인 이름이 있어도 표에서 조용히
// 빠지지 않고 "0 (0.0%)"로 보이게 하기 위함(스큐 판정에 0회도 유의미한 신호라서).
const nameCount: Record<string, number> = {};
for (const name of Object.values(DAY_NAME)) nameCount[name] = 0;

const markCount: Record<string, number> = { "(없음)": 0 };
let cells = 0;
let twoPlus = 0;

for (const b of BIRTHS) {
  const saju = calcSaju({ ...b, isLunar: false, gender: "other" });
  const temporal = calcTemporalLuck(baseDateForKst(TODAY), b.year, { includeMonth: true });
  const daily = temporal.dailyLuck; // optional 타입 — includeMonth:true 라 항상 채워지지만 좁혀서 쓴다
  if (!daily) {
    console.warn(`  ⚠ dailyLuck 없음 — ${b.year}-${b.month}-${b.day} 표본 스킵`);
    continue;
  }
  for (const cell of buildCalendar(saju, daily, TODAY)) {
    cells++;
    const name = DAY_NAME[cell.tenGod];
    nameCount[name] = (nameCount[name] ?? 0) + 1;

    if (cell.marks.length === 0) {
      markCount["(없음)"]++;
    } else {
      for (const m of cell.marks) markCount[m.label] = (markCount[m.label] ?? 0) + 1;
    }
    if (cell.marks.length >= 2) twoPlus++;
  }
}

function printSorted(title: string, counts: Record<string, number>, total: number) {
  console.log(`\n■ ${title}`);
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [label, n] of rows) {
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${label.padEnd(14)} ${String(n).padStart(4)}  (${pct}%)`);
  }
}

console.log(`표본 ${BIRTHS.length}명 × 30일 = ${cells}칸`);
printSorted("하루 이름", nameCount, cells);
printSorted("마크", markCount, cells);
console.log(`\n■ 2개 이상 마크 동시발생`);
console.log(`  ${twoPlus} / ${cells}  (${cells > 0 ? ((twoPlus / cells) * 100).toFixed(1) : "0.0"}%)`);

// ── 십신 × 등급 교차 (P5-2) ────────────────────────────────────────────
// 위 BIRTHS(5명×30일=150칸)는 하루 이름·마크 집계엔 충분하지만, 십신 10종으로 쪼개면 칸당
// 15개 안팎이라 십신×등급 교차를 보기엔 얇다 — BIRTHS 는 그대로 두고(위 두 집계는 계속 그
// 표본을 쓴다) 교차 전용으로 표본을 넓힌다.
//
// 일주(일간+일지)는 달력일이 하루 지날 때마다 60갑자를 정확히 1씩 순회한다. 그래서 임의의
// 기준일에서 연속 60일을 "생일"로 고르면 일간 10종(6회씩)·일지 12종(5회씩)이 완전히 고르게
// 섞인 표본이 된다 — 손으로 고른 생년월일 몇 개보다 이 방식이 "고루 섞였다"를 코드로 보장한다.
// 시(時)는 6/12/21 세 대표값을 돌려 같은 일주라도 시주가 달라지게 한다(오행분포·scarcity 에도
// 변화를 주기 위함 — 23시는 야자시로 일주 자체가 바뀌는 특수 케이스라 일부러 뺐다).
// 60갑자 × 3시간대 = 180명 × 30일 = 5,400칸(위 150칸의 36배) — day-score.ts 를 바꾸지 않는 한
// 재실행해도 같은 값이 나오는 결정론적 표본이다.
const CROSS_HOURS = [6, 12, 21];
const CROSS_BASE_DATE = new Date(2000, 0, 1); // 임의 기준일 — 60일 주기라 어디서 시작해도 60갑자 전부를 순회한다

function crossBirths(): { year: number; month: number; day: number; hour: number }[] {
  const out: { year: number; month: number; day: number; hour: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(CROSS_BASE_DATE);
    d.setDate(d.getDate() + i);
    for (const hour of CROSS_HOURS) {
      out.push({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour });
    }
  }
  return out;
}

interface ToneCount {
  good: number;
  normal: number;
  caution: number;
  total: number;
}

// 위 nameCount 와 같은 이유로 십신 10종을 전부 0으로 먼저 채워둔다.
const crossCount: Record<TenGod, ToneCount> = {} as Record<TenGod, ToneCount>;
for (const t of Object.keys(DAY_NAME) as TenGod[]) {
  crossCount[t] = { good: 0, normal: 0, caution: 0, total: 0 };
}

let crossCells = 0;
for (const b of crossBirths()) {
  const saju = calcSaju({ ...b, isLunar: false, gender: "other" });
  const temporal = calcTemporalLuck(baseDateForKst(TODAY), b.year, { includeMonth: true });
  const daily = temporal.dailyLuck; // optional 타입 — includeMonth:true 라 항상 채워지지만 좁혀서 쓴다
  if (!daily) {
    console.warn(`  ⚠ dailyLuck 없음 — ${b.year}-${b.month}-${b.day} 표본 스킵`);
    continue;
  }
  for (const cell of buildCalendar(saju, daily, TODAY)) {
    crossCount[cell.tenGod][cell.grade.tone]++;
    crossCount[cell.tenGod].total++;
    crossCells++;
  }
}

function printCross(title: string, counts: Record<TenGod, ToneCount>) {
  console.log(`\n■ ${title}`);
  // caution 비율 내림차순 — "어느 십신이 caution 에 많이 붙나"를 보려는 표라서.
  const rows = (Object.entries(counts) as [TenGod, ToneCount][]).sort(
    (a, b) => b[1].caution / b[1].total - a[1].caution / a[1].total
  );
  for (const [tg, c] of rows) {
    const pct = (n: number) => (c.total > 0 ? ((n / c.total) * 100).toFixed(1) : "0.0");
    console.log(
      `  ${tg.padEnd(4)} 표본${String(c.total).padStart(5)}칸  good ${pct(c.good).padStart(5)}%  normal ${pct(c.normal).padStart(5)}%  caution ${pct(c.caution).padStart(5)}%`
    );
  }
}

console.log(`\n표본(교차 전용) 60갑자 × ${CROSS_HOURS.length}시간대 = ${60 * CROSS_HOURS.length}명 × 30일 = ${crossCells}칸`);
printCross("십신 × 등급 교차 (caution 비율 내림차순 — DAY_LINE 카피 참고용)", crossCount);
