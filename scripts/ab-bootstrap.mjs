// 반반(A/B) 판정 부트스트랩 — 단위 행(방문자·가입자)에서 두 그룹 평균 차이의 95% 구간.
// 사용: node scripts/ab-bootstrap.mjs <rows.json> [--a new] [--b old] [--metric signed_up] [--metric rev48] [--iters 10000]
// rows.json = run-prod-query 출력(JSON 배열 — 각 행에 arm 과 지표 열). 지표를 안 주면 signed_up·rev48.
// 결정론적 난수(재실행해도 같은 구간). 판정 문구: 구간이 0 위 = "확실히 +", 0 아래 = "확실히 −", 걸치면 "걸침".
// 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §7 (메뉴판 판정에도 --a menu --b legacy 로 쓸 수 있다)
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error("사용: node scripts/ab-bootstrap.mjs <rows.json> [--a new] [--b old] [--metric m]... [--iters N]");
  process.exit(1);
}
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const metrics = args.flatMap((a, i) => (a === "--metric" ? [args[i + 1]] : []));
const A = opt("a", "new");
const B = opt("b", "old");
const iters = Number(opt("iters", "10000"));
const rows = JSON.parse(readFileSync(file, "utf8"));

// mulberry32 — 시드 고정
let seed = 20261011;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

for (const m of metrics.length ? metrics : ["signed_up", "rev48"]) {
  const a = rows.filter((r) => r.arm === A).map((r) => Number(r[m]));
  const b = rows.filter((r) => r.arm === B).map((r) => Number(r[m]));
  if (!a.length || !b.length) {
    console.log(JSON.stringify({ metric: m, error: "그룹이 비어 있다", n_a: a.length, n_b: b.length }));
    continue;
  }
  const diffs = new Array(iters);
  for (let i = 0; i < iters; i++) {
    let sa = 0;
    let sb = 0;
    for (let j = 0; j < a.length; j++) sa += a[Math.floor(rand() * a.length)];
    for (let j = 0; j < b.length; j++) sb += b[Math.floor(rand() * b.length)];
    diffs[i] = sa / a.length - sb / b.length;
  }
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.floor(0.025 * iters)];
  const hi = diffs[Math.ceil(0.975 * iters) - 1];
  const verdict = lo > 0 ? "확실히 +" : hi < 0 ? "확실히 −" : "걸침";
  console.log(
    JSON.stringify({ metric: m, a: A, b: B, n_a: a.length, n_b: b.length, mean_a: mean(a), mean_b: mean(b), diff: mean(a) - mean(b), ci95: [lo, hi], verdict })
  );
}
