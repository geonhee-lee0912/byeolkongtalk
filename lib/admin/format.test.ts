import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMetric, formatSignedWon, LOCALE } from "./format.ts";

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

// 🔴 percent 의 toFixed 결함과 같은 클래스가 ratio 에도 있었다 — 0.615 는 배정도 부동소수로
// 0.6149999999999999... 에 저장돼 toFixed(2) 가 곧장 "0.61" 로 잘못 반올림한다.
test("ratio 의 반올림 경계 — 0.615 는 0.62 로 올림된다(toFixed 부동소수 결함 회귀 방지)", () => {
  assert.equal(formatMetric(0.615, "ratio"), "0.62");
});

// 🔴 ko-KR 과 en-US 는 천단위 구분자가 바이트 단위로 동일해("1,000") formatMetric 의 출력
// 문자열만으로는 "로케일이 고정됐다"를 증명하지 못한다 — LOCALE 을 통째로 지우고 시스템/en-US
// 기본값에 맡겨도 이 옛 assert 는 그대로 통과했다. export 된 LOCALE 상수 값 자체를 잠근다.
test("로케일이 고정돼 있다 — 시스템 로케일에 좌우되지 않는다", () => {
  assert.equal(LOCALE, "ko-KR");
  assert.ok(formatMetric(1000, "count").includes(","));
});

test("부호 있는 금액은 유니코드 마이너스와 + 를 명시한다", () => {
  assert.equal(formatSignedWon(-12400), "−12,400원");
  assert.equal(formatSignedWon(64200), "+64,200원");
  assert.equal(formatSignedWon(0), "+0원");
});
