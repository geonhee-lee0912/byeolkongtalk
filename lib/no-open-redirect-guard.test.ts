import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// 회귀 잠금 — 오픈 리다이렉트 결함 식 `startsWith("//")` 가 되살아나지 못하게 한다.
// 이 패턴은 파서 규칙을 문자열 검사로 흉내 내다 외부행 입력을 통과시킨 결함의 지문이다
// (2026-10-02 safe-internal-path 도입으로 전량 제거). 리다이렉트 값 검증은 safeInternalPath/safeNextPath 로.

const ROOT = join(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "lib"];
const EXTS = new Set([".ts", ".tsx"]);
// 허용 예외: 안티패턴을 "언급"해야 하는 파일(이 테스트 자신, 헬퍼 주석 등)
const ALLOW = new Set([
  join("lib", "no-open-redirect-guard.test.ts"),
]);

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf(".")))) out.push(full);
  }
}

test('안티패턴 startsWith("//") 가 app/·lib/ 에 0건', () => {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

  const needle = /startsWith\(\s*["']\/\/["']\s*\)/;
  const offenders: string[] = [];
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1);
    if (ALLOW.has(rel)) continue;
    if (needle.test(readFileSync(f, "utf8"))) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    `오픈 리다이렉트 결함 식이 남아있다. safeInternalPath/safeNextPath 로 교체할 것:\n  ${offenders.join("\n  ")}`
  );
});
