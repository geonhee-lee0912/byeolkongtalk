// qa/report.ts — 트랜스크립트 JSON 저장 + 사람이 읽는 요약 md.
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { CaseResult } from "./types.ts";

export function buildSummaryMd(results: CaseResult[]): string {
  const lines: string[] = ["# QA 런 요약", ""];
  let pass = 0, assertFail = 0, judgeFlag = 0;

  for (const r of results) {
    const aFail = r.assertions.filter((a) => !a.pass);
    const jFail = (r.judge?.dimensions ?? []).filter((d) => !d.pass);
    if (aFail.length) assertFail++;
    if (jFail.length) judgeFlag++;
    if (!aFail.length && !jFail.length) pass++;
  }

  lines.push(`- ✅ pass: ${pass}`);
  lines.push(`- ❌ assertion-fail: ${assertFail}`);
  lines.push(`- ⚠️ judge-flag: ${judgeFlag}`);
  lines.push("", "---", "");

  for (const r of results) {
    const t = r.transcript;
    lines.push(`## ${t.caseId}`);
    lines.push(`- 종료: ${t.finishReason} / 턴: ${t.turns.length} / 별: ${t.startBalance}→${t.endBalance} (cost ${t.cost})`);

    const aFail = r.assertions.filter((a) => !a.pass);
    if (aFail.length) {
      lines.push(`- ❌ 단언 실패:`);
      for (const a of aFail) lines.push(`  - **${a.name}**: ${a.detail}`);
    } else {
      lines.push(`- ✅ 단언 전부 통과`);
    }

    if (r.judge) {
      const jFail = r.judge.dimensions.filter((d) => !d.pass);
      if (jFail.length) {
        lines.push(`- ⚠️ 심판 위반:`);
        for (const d of jFail) lines.push(`  - **${d.dimension}**: ${d.evidence}`);
      } else {
        lines.push(`- ✅ 심판 전부 통과`);
      }
      lines.push(`- 심판 총평: ${r.judge.summary}`);
    }

    lines.push("", "<details><summary>대화 보기</summary>", "");
    for (let i = 0; i < t.turns.length; i++) {
      lines.push(`**[사용자]** ${t.turns[i].userText}`, "", `**[별콩이]** ${t.turns[i].assistantText}`, "");
    }
    lines.push("</details>", "");
  }
  return lines.join("\n");
}

/** runId(타임스탬프)는 호출자가 넘긴다 (스크립트 내 Date 사용 가능 — node 런타임). */
export function writeReport(runId: string, results: CaseResult[]): string {
  const dir = join(process.cwd(), "qa", "out", runId);
  mkdirSync(dir, { recursive: true });
  for (const r of results) {
    writeFileSync(join(dir, `${r.transcript.caseId}.json`), JSON.stringify(r, null, 2), "utf-8");
  }
  writeFileSync(join(dir, "summary.md"), buildSummaryMd(results), "utf-8");
  return dir;
}
