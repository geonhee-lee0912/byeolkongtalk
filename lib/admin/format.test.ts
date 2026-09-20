import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMetric, formatSignedWon } from "./format.ts";

test("won 은 반올림 + ko-KR 천단위 + '원'", () => {
  assert.equal(formatMetric(12345.6, "won"), "12,346원");
  assert.equal(formatMetric(0, "won"), "0원");
});

test("percent 는 소수 1자리", () => {
  assert.equal(formatMetric(67.55, "percent"), "67.6%");
  assert.equal(formatMetric(100, "percent"), "100.0%");
});

test("count 는 정수 천단위, ratio 는 소수 2자리", () => {
  assert.equal(formatMetric(1234, "count"), "1,234");
  assert.equal(formatMetric(0.1234, "ratio"), "0.12");
});

// 🔴 로케일을 고정하지 않으면 서버(UTC/en-US)와 브라우저에서 구분자가 갈려 하이드레이션이 깨진다.
test("로케일이 고정돼 있다 — 시스템 로케일에 좌우되지 않는다", () => {
  assert.ok(formatMetric(1000, "count").includes(","));
});

test("부호 있는 금액은 유니코드 마이너스와 + 를 명시한다", () => {
  assert.equal(formatSignedWon(-12400), "−12,400원");
  assert.equal(formatSignedWon(64200), "+64,200원");
  assert.equal(formatSignedWon(0), "+0원");
});
