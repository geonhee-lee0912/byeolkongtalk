import { test } from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError } from "./chunk-error.ts";

test("turbopack 청크 로드 실패 — prod 실제 메시지", () => {
  // 2026-07-28 prod error_logs 원문 (route=/readings)
  const e = new Error(
    "Failed to load chunk /_next/static/chunks/0kffyt0bf.ut4.js?dpl=dpl_BukUiZKawC8L8EaDTzTLfAAqWJHb from module 64893",
  );
  assert.equal(isChunkLoadError(e), true);
});

test("webpack 폴백 번들러의 ChunkLoadError", () => {
  const e = new Error("Loading chunk 843 failed.");
  e.name = "ChunkLoadError";
  assert.equal(isChunkLoadError(e), true);
  assert.equal(isChunkLoadError(new Error("Loading CSS chunk 12 failed.")), true);
});

test("네이티브 동적 import 실패", () => {
  assert.equal(
    isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/a.js")),
    true,
  );
});

test("일반 앱 에러는 청크 에러가 아니다", () => {
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(new Error("리딩을 불러오지 못했어")), false);
});

test("Error 가 아닌 값에도 안전", () => {
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError("Failed to load chunk /a.js from module 1"), true);
});
