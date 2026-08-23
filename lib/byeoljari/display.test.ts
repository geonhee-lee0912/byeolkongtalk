import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAR_ELEMENT_COLORS,
  starColor,
  BOND_COLOR,
  elementRelationLabel,
  relationTypeLabel,
  subjectParticle,
  directionParticle,
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

test("subjectParticle — 받침 있으면 이, 없으면 가", () => {
  assert.equal(subjectParticle("이 별"), "이"); // 별=받침 ㄹ
  assert.equal(subjectParticle("로엔"), "이");  // 엔=받침 ㄴ
  assert.equal(subjectParticle("지호"), "가");  // 호=받침 없음
  assert.equal(subjectParticle("Roen"), "가");  // 한글 밖 → 기본 가
});

test("directionParticle — 받침 없으면 로", () => {
  assert.equal(directionParticle("이무기"), "로");
  assert.equal(directionParticle("백호"), "로");
  assert.equal(directionParticle("가오리"), "로");
});

test("directionParticle — 받침 있으면 으로", () => {
  assert.equal(directionParticle("청룡"), "으로");
  assert.equal(directionParticle("기린"), "으로");
  assert.equal(directionParticle("사슴"), "으로");
});

test("directionParticle — ㄹ받침은 로(예외)", () => {
  assert.equal(directionParticle("서울"), "로");
});

test("directionParticle — 한글 완성형 밖은 로", () => {
  assert.equal(directionParticle("abc"), "로");
});

test("BOND_COLOR — 끌림 골드·결속 보라·같은 결 청록", () => {
  assert.equal(BOND_COLOR.heavenly, "#F2D78A");
  assert.equal(BOND_COLOR.six, "#A98BEE");
  assert.equal(BOND_COLOR.triad, "#5DCAA5");
});
