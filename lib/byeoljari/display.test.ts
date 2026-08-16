import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAR_ELEMENT_COLORS,
  starColor,
  elementRelationLabel,
  relationTypeLabel,
} from "./display.ts";

test("STAR_ELEMENT_COLORS — 5 오행 발광 팔레트", () => {
  assert.equal(STAR_ELEMENT_COLORS.목, "#4FD6B8");
  assert.equal(STAR_ELEMENT_COLORS.수, "#8AB4F8");
  assert.equal(Object.keys(STAR_ELEMENT_COLORS).length, 5);
});

test("starColor — 알 수 없는 오행은 폴백(크래시 금지)", () => {
  assert.equal(starColor("목"), "#4FD6B8");
  assert.equal(starColor("허수"), "#9F8AD0");
});

test("elementRelationLabel — 5 관계 + 폴백", () => {
  assert.equal(elementRelationLabel("생아"), "나를 북돋아 주는 기운");
  assert.equal(elementRelationLabel("아극"), "내가 이끌어 가는 흐름");
  assert.equal(elementRelationLabel("???"), "이어져 있는 사이");
});

test("relationTypeLabel — 4 관계분류 + 폴백", () => {
  assert.equal(relationTypeLabel("friend"), "친구");
  assert.equal(relationTypeLabel("senior"), "윗사람");
  assert.equal(relationTypeLabel("xyz"), "인연");
});
