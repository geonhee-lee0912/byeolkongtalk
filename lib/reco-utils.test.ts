import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAllRecoMarkers,
  RECO_DISPLAY,
  RECO_PRODUCTS,
} from "./reco-utils.ts";

/**
 * 회귀 방지: [RECO:...] 추출은 enum(RECO_PRODUCTS) 밖 값을 절대 통과시키면 안 된다.
 *
 * 2026-08-02 prod 크래시(`undefined is not an object (evaluating 'a.label')`,
 * /tarot/reading): reading 페이지가 `m[1].toLowerCase() as RecoProduct` 로 무가드
 * 캐스팅해, LLM 이 환각 마커(예: [RECO:tarot_love])를 뱉으면 enum 밖 값이 새어
 * RECO_DISPLAY[product] === undefined → RecoInlineCard 의 display.label 크래시로
 * 결과 화면 전체가 죽었다. 마커가 DB 에 저장되면 그 reading 은 열 때마다 재크래시.
 * 이 테스트가 "추출 결과는 항상 RECO_DISPLAY 의 유효 키"를 강제한다.
 */

test("parseAllRecoMarkers — enum 밖 마커(LLM 환각)는 버린다", () => {
  // 정규식 [a-z0-9_:]+ 에는 걸리지만 RECO_PRODUCTS 에 없는 값들
  assert.deepEqual(parseAllRecoMarkers("앞부분 [RECO:tarot_love] 뒷부분"), []);
  assert.deepEqual(parseAllRecoMarkers("[RECO:saju] [RECO:relationship]"), []);
  assert.deepEqual(parseAllRecoMarkers("[RECO:tarot:relationship]"), []); // 오타(_5 누락)
});

test("parseAllRecoMarkers — 유효 마커를 등장 순서로, 중복 없이 반환", () => {
  const text =
    "가 [RECO:saju:nature] 나 [RECO:continue] 다 [RECO:saju:nature] 라";
  assert.deepEqual(parseAllRecoMarkers(text), ["saju:nature", "continue"]);
});

test("parseAllRecoMarkers — 유효/무효 혼재 시 유효만 남긴다", () => {
  const text = "[RECO:saju:choice][RECO:bogus][RECO:extend]";
  assert.deepEqual(parseAllRecoMarkers(text), ["saju:choice", "extend"]);
});

test("parseAllRecoMarkers — 마커 없으면 빈 배열", () => {
  assert.deepEqual(parseAllRecoMarkers("아무 마커도 없는 평범한 응답"), []);
});

test("parseAllRecoMarkers — 대소문자 무시(LLM 이 대문자로 뱉어도)", () => {
  assert.deepEqual(parseAllRecoMarkers("[RECO:SAJU:NATURE]"), ["saju:nature"]);
});

test("parseAllRecoMarkers — 반환값은 전부 RECO_DISPLAY 의 유효 키 (undefined 조회 불가 보장)", () => {
  // 모든 유효 product + 환각 몇 개를 섞어도, 반환된 건 전부 조회 가능해야 한다.
  const everything =
    RECO_PRODUCTS.map((p) => `[RECO:${p}]`).join(" ") +
    " [RECO:tarot_love] [RECO:garbage]";
  for (const p of parseAllRecoMarkers(everything)) {
    assert.ok(RECO_DISPLAY[p], `${p}: RECO_DISPLAY 에 존재해야 함`);
    assert.equal(typeof RECO_DISPLAY[p].label, "string", `${p}: label 존재`);
  }
});
