// qa/compare.ts — 기준선 런 vs 후보 런의 대응 케이스를 턴별 pairwise 로 비교해 후보 승률을 낸다.
// 사용: node --import tsx --env-file=.env.local qa/compare.ts <baseline_out_dir> <candidate_out_dir>
//   (예) node --import tsx --env-file=.env.local qa/compare.ts qa/out/2026-08-10T... qa/out/2026-08-10T...
//
// 두 디렉토리는 qa/run.ts 가 케이스마다 저장한 <caseId>.json(=CaseResult) 들을 담는다.
// report.ts 에 로더가 없어(쓰기 전용) 여기서 JSON 을 직접 로드한다.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { pairwise } from "./evaluate/pairwise.ts";
import type { CaseResult } from "./types.ts";

/** 한 런 디렉토리의 모든 <caseId>.json 을 caseId → CaseResult 로 로드(summary.md 제외). */
function loadDir(dir: string): Map<string, CaseResult> {
  const m = new Map<string, CaseResult>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const r = JSON.parse(readFileSync(join(dir, f), "utf-8")) as CaseResult;
    m.set(r.transcript.caseId, r);
  }
  return m;
}

const assertFails = (r: CaseResult): number => r.assertions.filter((a) => !a.pass).length;

async function main() {
  const [baselineDir, candidateDir] = process.argv.slice(2);
  if (!baselineDir || !candidateDir) {
    console.error("사용: node --import tsx --env-file=.env.local qa/compare.ts <baseline_out_dir> <candidate_out_dir>");
    process.exit(1);
  }

  const base = loadDir(baselineDir);
  const cand = loadDir(candidateDir);
  const caseIds = [...base.keys()].filter((id) => cand.has(id)).sort();
  if (caseIds.length === 0) {
    console.error("대응되는 케이스가 없어 — 두 디렉토리가 같은 케이스 세트로 실행됐는지 확인.");
    process.exit(1);
  }

  const lines: string[] = [
    "# pairwise 비교 (기준선 vs 후보)",
    "",
    `- 기준선: \`${baselineDir}\``,
    `- 후보: \`${candidateDir}\``,
    "- ⚠️ 턴>0 은 시뮬레이터가 각 응답에 반응해 대화가 갈라진다 — 유저 발화는 기준선 것을 문맥으로 쓴다",
    "  (후보의 실제 문맥과 다를 수 있음). 캘리브레이션·해석 시 감안할 것.",
    "",
    "| 케이스 | 턴 | 후보승 | 기준선승 | tie | 후보승률 | 단언실패(기준선/후보) |",
    "|---|---|---|---|---|---|---|",
  ];

  let totCand = 0, totBase = 0, totTie = 0, totTurns = 0;
  for (let ci = 0; ci < caseIds.length; ci++) {
    const id = caseIds[ci];
    const b = base.get(id)!;
    const c = cand.get(id)!;
    const n = Math.min(b.transcript.turns.length, c.transcript.turns.length);
    let cw = 0, bw = 0, tie = 0;
    for (let ti = 0; ti < n; ti++) {
      const { winner } = await pairwise(
        b.transcript.turns[ti].userText,
        b.transcript.turns[ti].assistantText,
        c.transcript.turns[ti].assistantText,
        ci * 100 + ti, // seedIndex — 위치 무작위(재현성)
      );
      if (winner === "candidate") cw++;
      else if (winner === "baseline") bw++;
      else tie++;
    }
    totCand += cw; totBase += bw; totTie += tie; totTurns += n;
    const rate = n ? ((cw / n) * 100).toFixed(0) : "0";
    lines.push(`| ${id} | ${n} | ${cw} | ${bw} | ${tie} | ${rate}% | ${assertFails(b)}/${assertFails(c)} |`);
    process.stdout.write(`\n[compare] ${id}: 후보 ${cw} / 기준선 ${bw} / tie ${tie} (n=${n})`);
  }

  const winRate = totTurns ? ((totCand / totTurns) * 100).toFixed(1) : "0";
  lines.push(
    "",
    "---",
    "",
    `**총평**: 후보 승률 ${winRate}% — 후보 ${totCand}승 / 기준선 ${totBase}승 / tie ${totTie} ` +
      `(n=${totTurns}턴, 케이스 ${caseIds.length}개)`,
  );

  const outPath = join(process.cwd(), "qa", "out", `compare-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`\n\n[compare] 후보 승률 ${winRate}% (n=${totTurns}턴, 케이스 ${caseIds.length}개). 리포트: ${outPath}`);
}

main().catch((e) => {
  console.error("[compare] 오류:", e);
  process.exit(1);
});
