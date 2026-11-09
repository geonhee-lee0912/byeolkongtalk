// 계약: 화면·컴포넌트는 body·html 의 overflow 를 직접 바꾸지 않는다 — 뒤 화면 스크롤 잠금은 overlayStack(lib/app-shell/overlay-stack.ts) 하나가 한다.
// 각자 잠그면 겹창이 겹칠 때 먼저 닫힌 쪽이 잠금을 풀거나(뒤 화면이 움직임) 엉뚱한 값으로 되돌린다(스크롤이 영영 막힘).
// 겹창은 components/common/Sheet·Dialog, 틀에 안 맞는 겹창은 useOverlayEntry 를 쓴다. 스펙 2026-11-07-앱-화면 §8
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];
const DIRECT_LOCK = /(body|documentElement)\.style\.overflow\s*=/;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("컴포넌트는 body·html overflow 를 직접 바꾸지 않는다", () => {
  const offenders = ROOTS.flatMap(sources).filter((p) => DIRECT_LOCK.test(readFileSync(p, "utf8")));
  assert.deepEqual(offenders, []);
});
