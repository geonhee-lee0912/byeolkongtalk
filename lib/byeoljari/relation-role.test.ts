import { test } from "node:test";
import assert from "node:assert/strict";
import { relationRole, elementPair, metaphorProse } from "./relation-role.ts";

test("relationRole — 톤 C 역할 라벨", () => {
  assert.equal(relationRole("생아"), "곁에서 힘이 되는 인연");
  assert.equal(relationRole("아극"), "내가 이끌어 가는 인연");
  assert.equal(relationRole("비화"), "결이 닮은 인연");
  assert.equal(relationRole("?"), "이어져 있는 인연");
});

test("elementPair — 오행쌍 한글+한자", () => {
  assert.equal(elementPair("생아", "금", "토"), "토생금(土生金)"); // 나=금, 상대=토, 상대생나
  assert.equal(elementPair("아극", "금", "목"), "금극목(金剋木)"); // 나=금이 상대=목을 극
  assert.equal(elementPair("비화", "금", "금"), "같은 금(金)");
});

test("metaphorProse — 오행 이미지 메타포(조사 포함)", () => {
  assert.equal(
    metaphorProse("생아", "금", "토"),
    "흙이 쇠를 살리듯, 곁에 있으면 기운이 차오르는 사이야"
  );
  assert.equal(
    metaphorProse("아극", "금", "목"),
    "쇠가 나무를 다루듯, 내가 이끌어 가는 흐름이야"
  );
  assert.equal(
    metaphorProse("비화", "금", "금"),
    "같은 쇠처럼 닮아, 말 안 해도 통하는 사이야"
  );
  assert.equal(metaphorProse("생아", "?", "토"), "이어져 있는 사이야"); // 미지 오행 폴백
});
