import { test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath, safeNextPath } from "./safe-internal-path.ts";

// ── 정상 내부 경로는 그대로 통과 ──────────────────────────────
test("평범한 내부 경로는 통과", () => {
  assert.equal(safeInternalPath("/fortune/love_self"), "/fortune/love_self");
});

test("쿼리·해시 보존", () => {
  assert.equal(safeInternalPath("/relationship?rel=5#x"), "/relationship?rel=5#x");
  assert.equal(safeInternalPath("/start?tag=love_self&v=a"), "/start?tag=love_self&v=a");
});

test("우리 도메인 경로처럼 보이는 /@... 는 내부 경로라 통과", () => {
  assert.equal(safeInternalPath("/@example.com"), "/@example.com");
});

// ── 2026-10-02 실측 재현 4건 — 전부 거부 ──────────────────────
test("재현: 백슬래시 /\\x (현행 가드가 통과시키던 외부행)", () => {
  assert.equal(safeInternalPath("/\\example.com"), null);
});

test("재현: 탭 /<TAB>/x", () => {
  assert.equal(safeInternalPath("/\t/example.com"), null);
});

test("재현: 개행 /<LF>/x", () => {
  assert.equal(safeInternalPath("/\n/example.com"), null);
});

test("재현: 이중슬래시 //x", () => {
  assert.equal(safeInternalPath("//example.com"), null);
});

// ── 고치다 생기기 쉬운 회귀(dot-segment 정규화 후 재탈출) 거부 ──
test("회귀차단: /.//x 는 정규화되면 //x 가 되므로 거부", () => {
  assert.equal(safeInternalPath("/.//example.com"), null);
});

test("회귀차단: 퍼센트 인코딩 dot %2e//x", () => {
  assert.equal(safeInternalPath("/%2e//example.com"), null);
});

test("회귀차단: 상위참조 /a/..//x", () => {
  assert.equal(safeInternalPath("/a/..//example.com"), null);
});

test("회귀차단: /\\/x·/\\/ 변형", () => {
  assert.equal(safeInternalPath("/\\/example.com"), null);
  assert.equal(safeInternalPath("/\\/"), null);
});

// ── 설계상 원래 막혀야 할 것들 ────────────────────────────────
test("절대 URL 거부(same-origin 이어도 — 내부 상대경로만 허용)", () => {
  assert.equal(safeInternalPath("https://example.com"), null);
  assert.equal(safeInternalPath("https://byeolkongtalk.com/fortune"), null);
});

test("javascript: 스킴 거부", () => {
  assert.equal(safeInternalPath("javascript:alert(1)"), null);
});

test("빈 값·앞 공백·단일 백슬래시 거부", () => {
  assert.equal(safeInternalPath(""), null);
  assert.equal(safeInternalPath(" /example.com"), null);
  assert.equal(safeInternalPath("\\example.com"), null);
});

test("null·undefined 는 null", () => {
  assert.equal(safeInternalPath(null), null);
  assert.equal(safeInternalPath(undefined), null);
});

// ── safeNextPath 래퍼: 실패 시 "/" ───────────────────────────
test("safeNextPath: 통과 경로는 그대로, 거부는 /", () => {
  assert.equal(safeNextPath("/fortune"), "/fortune");
  assert.equal(safeNextPath("/\\example.com"), "/");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(""), "/");
});
