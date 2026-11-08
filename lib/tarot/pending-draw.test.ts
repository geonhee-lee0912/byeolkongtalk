import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PENDING_DRAW_KEY, clearPendingDraw } from "./pending-draw.ts";

// 입구 반반(로그인 전 맛보기)이 남긴 진행 저장 청소 — 저장·복원 코드는 판정(2026-11-07, 옛 흐름 고정) 뒤 걷어냈다.

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test("키는 입구 반반 때 쓰던 그대로다 — 바뀌면 남은 저장을 못 지운다", () => {
  assert.equal(PENDING_DRAW_KEY, "byeolkong:pending_draw");
});

test("clearPendingDraw 는 남은 저장만 지운다", () => {
  const s = memStore();
  s.setItem(PENDING_DRAW_KEY, JSON.stringify({ v: 1, concern: "고민 원문" }));
  s.setItem("byeolkong_user", "{}");
  clearPendingDraw(s);
  assert.equal(s.m.has(PENDING_DRAW_KEY), false);
  assert.equal(s.m.has("byeolkong_user"), true);
});

test("저장소가 막혀도(removeItem 이 던져도) 던지지 않는다", () => {
  const throwing = {
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => clearPendingDraw(throwing));
});

// ── 배선 계약 — 소스를 읽어 지키는 것. 주석 속 언급은 배선이 아니니 뺀다 ──────────

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sourceOf = (relFromRepoRoot: string) =>
  stripComments(readFileSync(new URL(`../../${relFromRepoRoot}`, import.meta.url), "utf8"));

test("홈 — 방문 때 남은 저장을 지운다(try 안에서)", () => {
  const code = sourceOf("app/page.tsx");
  assert.match(
    code,
    /try\s*\{\s*clearPendingDraw\(\s*localStorage\s*\)/,
    "홈이 남은 저장을 안 지우면 새 흐름 기기에 고민 원문이 무기한 남는다. try 밖이면 localStorage 가 막힌 브라우저에서 홈이 죽는다"
  );
});

test("마이페이지 — 로그아웃·탈퇴 둘 다 남은 저장(고민 원문)을 지운다", () => {
  const code = sourceOf("app/mypage/page.tsx");
  const calls = code.match(/clearPendingDraw\(/g)?.length ?? 0;
  assert.ok(calls >= 2, `clearPendingDraw( 호출이 ${calls}곳이다 — 로그아웃·탈퇴 둘 다 지워야 공용 기기에 고민 원문이 안 남는다`);
});
