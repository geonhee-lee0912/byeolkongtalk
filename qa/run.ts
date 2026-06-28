// qa/run.ts — 진입점. seed → 케이스 루프 → 드라이버 → 단언+심판 → 리포트.
import { config } from "./config.ts";
import { ensureTestUser, cleanTestData, topUpStars } from "./seed.ts";
import { collectCases, type CaseFilter } from "./cases/index.ts";
import { runConversation } from "./driver.ts";
import { runAssertions } from "./evaluate/assertions.ts";
import { judge } from "./evaluate/judge.ts";
import { writeReport } from "./report.ts";
import type { CaseResult } from "./types.ts";

function parseArgs(argv: string[]): { filter: CaseFilter; judgeOnly: boolean; clean: boolean } {
  const filter: CaseFilter = {};
  let judgeOnly = false;
  let clean = true;
  for (const a of argv) {
    if (a.startsWith("--product=")) filter.product = a.slice("--product=".length);
    else if (a.startsWith("--case=")) filter.caseKey = a.slice("--case=".length);
    else if (a.startsWith("--max-cases=")) filter.max = Number(a.slice("--max-cases=".length));
    else if (a === "--judge-only") judgeOnly = true;
    else if (a === "--no-clean") clean = false;
  }
  return { filter, judgeOnly, clean };
}

async function main() {
  const { filter, clean } = parseArgs(process.argv.slice(2));
  const cases = collectCases(filter);

  if (cases.length === 0) {
    console.error("매칭되는 케이스가 없어. --product / --case 확인.");
    process.exit(1);
  }

  // 비용 가드: 예상 chat 콜 수 안내
  const estCalls = cases.reduce((n, c) => n + c.maxTurns + 1, 0);
  console.log(`[qa] 케이스 ${cases.length}개 / 예상 chat 콜 ~${estCalls} (콜당 별콩이+심판; 시뮬레이터는 턴마다 haiku 1콜)`);
  console.log(`[qa] BASE_URL=${config.BASE_URL}  (dev 서버 떠 있어야 함)`);

  await ensureTestUser();
  if (clean) await cleanTestData();
  await topUpStars();

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`\n[qa] ▶ ${c.id} ... `);
    const transcript = await runConversation(c);
    const assertions = runAssertions(transcript, c.expects);
    let judgeResult = null;
    try {
      judgeResult = await judge(transcript);
    } catch (e) {
      console.error(`심판 실패: ${(e as Error).message}`);
    }
    results.push({ transcript, assertions, judge: judgeResult });

    const aFail = assertions.filter((a) => !a.pass).length;
    const jFail = judgeResult?.dimensions.filter((d) => !d.pass).length ?? 0;
    process.stdout.write(aFail || jFail ? `❌단언${aFail}/⚠️심판${jFail}` : "✅");
  }

  // runId = 타임스탬프 (node 런타임이라 Date 사용 OK)
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = writeReport(runId, results);

  const pass = results.filter(
    (r) => !r.assertions.some((a) => !a.pass) && !(r.judge?.dimensions.some((d) => !d.pass))
  ).length;
  console.log(`\n\n[qa] 완료: ✅${pass} / 전체 ${results.length}`);
  console.log(`[qa] 리포트: ${dir}/summary.md`);
}

main().catch((e) => {
  console.error("[qa] 치명적 오류:", e);
  process.exit(1);
});
