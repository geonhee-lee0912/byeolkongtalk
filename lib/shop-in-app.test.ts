import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 배선 계약(소스 검사) — 앱 안 상점·충전 시트는 토스를 부르지 않고 스토어 결제(브리지)로 산다. 스펙 2026-11-23-앱-결제 §5.
 * 🔴 앱 안에서 토스 결제창·웹 결제 안내가 보이면 애플 3.1.1(외부 결제 유도) 심사 거절. 타입·빌드·유닛으로는 못 잡아서 소스로 잠근다.
 * 규칙: useTossPayment 는 이름이 Toss 로 시작하는 하위 컴포넌트 안에서만 부르고, 그 컴포넌트는 channel === "toss"(브라우저)일 때만 그린다
 * (훅은 조건부로 못 부르니 컴포넌트째 안 그린다). 토스를 말하는 글은 그 컴포넌트 안이거나 web-only(앱에서 CSS 로 숨김) 줄에만.
 */
const SCREENS = ["app/shop/page.tsx", "components/upsell/RechargeSheet.tsx"];

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** 주석을 지운다(설명 주석의 '토스' 는 화면에 안 나온다) — 줄 수는 유지 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** 최상위 함수 선언 구간 [이름, 시작, 끝) */
function topLevelFunctions(src: string): { name: string; start: number; end: number }[] {
  const re = /^(?:export default |export )?function (\w+)/gm;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1], start: m.index! }));
  return starts.map((f, i) => ({ ...f, end: i + 1 < starts.length ? starts[i + 1].start : src.length }));
}

for (const file of SCREENS) {
  const src = stripComments(read(file));
  const fns = topLevelFunctions(src);
  const tossFns = fns.filter((f) => src.slice(f.start, f.end).includes("useTossPayment("));

  test(`${file} — useTossPayment 는 Toss 하위 컴포넌트 하나 안에서만 부른다`, () => {
    const calls = [...src.matchAll(/useTossPayment\(/g)];
    assert.equal(calls.length, 1, "useTossPayment 호출은 한 곳");
    assert.equal(tossFns.length, 1);
    assert.match(tossFns[0].name, /^Toss\w+$/);
  });

  test(`${file} — Toss 하위 컴포넌트는 channel === "toss" 일 때만 그린다`, () => {
    const name = tossFns[0]?.name ?? "Toss";
    const all = [...src.matchAll(new RegExp(`<${name}\\b`, "g"))].length;
    const guarded = [...src.matchAll(new RegExp(`channel === "toss" &&\\s*\\(?\\s*<${name}\\b`, "g"))].length;
    assert.ok(all >= 1, `${name} 을 그리는 곳이 있다`);
    assert.equal(guarded, all, `${name} 을 그리는 모든 곳이 channel === "toss" 조건 아래`);
  });

  test(`${file} — 앱 경로는 useStorePurchase 로 산다`, () => {
    assert.match(src, /useStorePurchase\(/);
    assert.match(src, /\bbuy\(/);
  });

  test(`${file} — 토스·웹 결제를 말하는 글은 Toss 컴포넌트 안이거나 web-only 줄에만`, () => {
    const toss = tossFns.find((f) => /^Toss\w+$/.test(f.name)); // Toss 하위 컴포넌트만 — 화면 본체가 토스를 부르면 그 안의 글도 앱에 보인다
    src.split("\n").reduce((offset, line, i) => {
      const inToss = !!toss && offset >= toss.start && offset < toss.end;
      // 화면 글은 한국어다 — 영문 toss 는 코드 식별자(tossError·channel === "toss"·<TossX)라 보지 않는다
      if (/토스/.test(line) && !inToss) assert.match(line, /web-only/, `${file}:${i + 1} ${line.trim()}`);
      assert.doesNotMatch(line, /웹에서|홈페이지|브라우저에서/, `${file}:${i + 1}`);
      return offset + line.length + 1;
    }, 0);
  });
}
