// 별마루 하루 이름·마크의 실제 30일 빈도 측정(P5-1 검증용, 읽기 전용·네트워크 없음).
// 🔴 앞선 분포 분석은 '조합 전수'라 실제 빈도가 아니다 — 천간합·육합·충은 60갑자 중 특정 짝일
//    때만 나오므로 실제 달력에선 훨씬 드물다. 이 스크립트가 그 실제 값을 잰다.
// 실행: node --import tsx scripts/byeolmaru-label-freq.ts
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { buildCalendar } from "@/lib/byeolmaru/calendar";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";

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
