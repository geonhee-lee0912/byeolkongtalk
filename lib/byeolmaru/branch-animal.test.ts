import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { branchAnimal } from "./branch-animal.ts";

const ALL_BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

test("branchAnimal: 12지 전부 매핑 + 에셋 경로", () => {
  for (const b of ALL_BRANCHES) {
    const a = branchAnimal("갑" + b); // 천간 아무거나 + 지지
    assert.ok(a, `${b} 매핑 존재`);
    assert.ok(a.animal.length > 0, `${b} 동물 이름`);
    assert.equal(a.assetSrc, `/byeolmaru/branches/${a.code}.png`);
  }
});

test("branchAnimal: 지지는 간지의 2번째 글자로 조회한다", () => {
  assert.equal(branchAnimal("기축")?.animal, "소");
  assert.equal(branchAnimal("임신")?.animal, "원숭이");
  assert.equal(branchAnimal("경오")?.animal, "말");
});

test("branchAnimal: 12지 밖·짧은 문자열은 null(폴백)", () => {
  assert.equal(branchAnimal(""), null);
  assert.equal(branchAnimal("갑"), null);
  assert.equal(branchAnimal("갑갑"), null); // 갑은 천간, 지지 아님
});

test("branchAnimal: 12개 에셋 PNG 가 실제로 존재한다(매핑↔파일 정합)", () => {
  for (const b of ALL_BRANCHES) {
    const a = branchAnimal("갑" + b)!;
    const p = path.join(process.cwd(), "public", "byeolmaru", "branches", `${a.code}.png`);
    assert.ok(existsSync(p), `${a.code}.png 존재 (${b}=${a.animal})`);
  }
});
