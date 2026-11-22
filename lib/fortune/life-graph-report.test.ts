import { test } from "node:test";
import assert from "node:assert/strict";
import { alignDecadeAges, type LifeGraphDecade } from "./life-graph-report";

const d = (ageLabel: string): LifeGraphDecade => ({ ageLabel, score: 50, headline: "h", body: "b" });
const daeun = [
  { startAge: 4, endAge: 13 },
  { startAge: 14, endAge: 23 },
  { startAge: 24, endAge: 33 },
];

// dev 실물(11-21): 대운이 4세에 시작하는데 프롬프트의 'N0~N9세' 예시 때문에 AI 가 첫 구간을 '40~49세'로 적었다.
// 내용은 어린 시절인데 곡선 맨 앞이 '40~49'로 찍혔다 → 이름표는 결정론 대운 표에서 순서대로 다시 붙인다.
test("alignDecadeAges: 구간 수가 대운 표와 같으면 이름표를 대운 표 나이로 덮어쓴다", () => {
  const out = alignDecadeAges([d("40~49세"), d("14~23세"), d("24~33세")], daeun);
  assert.deepEqual(out.map((x) => x.ageLabel), ["4~13세", "14~23세", "24~33세"]);
});

test("alignDecadeAges: 점수·제목·본문은 그대로 둔다", () => {
  const src = [{ ageLabel: "40~49세", score: 54, headline: "기초", body: "어린 시절" }];
  const out = alignDecadeAges(src, [{ startAge: 4, endAge: 13 }]);
  assert.deepEqual(out[0], { ageLabel: "4~13세", score: 54, headline: "기초", body: "어린 시절" });
});

test("alignDecadeAges: 구간 수가 다르거나 대운 표가 없으면 손대지 않는다", () => {
  const src = [d("40~49세"), d("14~23세")];
  assert.deepEqual(alignDecadeAges(src, daeun), src);
  assert.deepEqual(alignDecadeAges(src, undefined), src);
  assert.deepEqual(alignDecadeAges(src, null), src);
});
