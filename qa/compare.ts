// qa/compare.ts — 기준선 런 vs 후보 런을 "전체 대화" 단위로 pairwise 비교해 후보 승률을 낸다.
// 사용: node --import tsx --env-file=.env.local qa/compare.ts <baseline_out_dir> <candidate_out_dir>
//
// 두 디렉토리는 qa/run.ts 가 케이스마다 저장한 <caseId>.json(=CaseResult) 들을 담는다.
// report.ts 에 로더가 없어(쓰기 전용) 여기서 JSON 을 직접 로드한다.
// ⚠️ 시뮬레이터가 reactive 라 두 런의 대화는 턴별로 갈라진다 → 턴별 비교(옛 방식)는 후보를 baseline
//   문맥으로 판정해 일괄 불리해졌다(캘리브레이션에서 실측: 품질 정반대인 후보 2종이 똑같이 ~17%).
//   그래서 케이스별 '전체 대화'를 통째로 넣어 어느 쪽이 더 별콩이다운지 판정한다.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { pairwiseConversation } from "./evaluate/pairwise.ts";
import type { CaseResult, Transcript } from "./types.ts";

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

/** 트랜스크립트를 심판용 텍스트로 렌더. */
function renderConvo(t: Transcript): string {
  return t.turns
    .map((x, i) => `[턴${i + 1} 유저] ${x.userText}\n[턴${i + 1} 별콩이] ${x.assistantText}`)
    .join("\n\n");
}

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
    "# pairwise 비교 (기준선 vs 후보, 전체 대화 단위)",
    "",
    `- 기준선: \`${baselineDir}\``,
    `- 후보: \`${candidateDir}\``,
    "- 케이스별로 '전체 대화'를 통째로 Opus 에 넣어 어느 쪽이 더 별콩이다운지 판정(턴 정렬 안 함).",
    "",
    "| 케이스 | 턴(기준/후보) | 승자 | 단언실패(기준/후보) | 근거 |",
    "|---|---|---|---|---|",
  ];

  let cw = 0, bw = 0, tie = 0, skipped = 0;
  for (let ci = 0; ci < caseIds.length; ci++) {
    const id = caseIds[ci];
    const b = base.get(id)!;
    const c = cand.get(id)!;
    const bn = b.transcript.turns.length;
    const cn = c.transcript.turns.length;
    // 어느 한쪽이 응답을 못 낸(크래시) 케이스는 판정 불가 → 실패로 표기하고 judge 건너뜀.
    if (bn === 0 || cn === 0) {
      skipped++;
      const who = cn === 0 ? "후보 무응답" : "기준선 무응답";
      lines.push(`| ${id} | ${bn}/${cn} | ⚠️${who} | ${assertFails(b)}/${assertFails(c)} | (대화 없음 — 판정 제외) |`);
      process.stdout.write(`\n[compare] ${id}: ⚠️${who} (판정 제외)`);
      continue;
    }
    const seed = b.transcript.turns[0]?.userText ?? "(고민 미상)";
    const { winner, reason } = await pairwiseConversation(
      seed,
      renderConvo(b.transcript),
      renderConvo(c.transcript),
      ci, // seedIndex — 위치 무작위(재현성)
    );
    const w = winner === "candidate" ? "후보" : winner === "baseline" ? "기준선" : "tie";
    if (winner === "candidate") cw++;
    else if (winner === "baseline") bw++;
    else tie++;
    lines.push(`| ${id} | ${bn}/${cn} | ${w} | ${assertFails(b)}/${assertFails(c)} | ${reason.replace(/\|/g, "/").slice(0, 60)} |`);
    process.stdout.write(`\n[compare] ${id}: ${w} — ${reason.slice(0, 45)}`);
  }

  const judged = cw + bw + tie;
  const winRate = judged ? ((cw / judged) * 100).toFixed(0) : "0";
  lines.push(
    "",
    "---",
    "",
    `**총평**: 후보 ${cw}승 / 기준선 ${bw}승 / tie ${tie} ` +
      `(판정 ${judged}케이스${skipped ? `, 무응답 제외 ${skipped}` : ""}). 후보 승률 ${winRate}%.`,
  );

  const outPath = join(process.cwd(), "qa", "out", `compare-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`\n\n[compare] 후보 ${cw}승/기준선 ${bw}승/tie ${tie} (승률 ${winRate}%, 판정 ${judged}케이스). 리포트: ${outPath}`);
}

main().catch((e) => {
  console.error("[compare] 오류:", e);
  process.exit(1);
});
