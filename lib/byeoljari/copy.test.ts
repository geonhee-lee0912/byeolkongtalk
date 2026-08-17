import { test } from "node:test";
import assert from "node:assert/strict";
import { RELATION_TEN_GOD_COPY, relationTenGodCopy } from "./copy.ts";

const RELATIONS = ["friend", "lover", "acquaintance", "senior"];
const TEN_GODS = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"];

test("40칸 전부 존재 + 빈 문자열 없음", () => {
  for (const r of RELATIONS) {
    for (const t of TEN_GODS) {
      const v = RELATION_TEN_GOD_COPY[r]?.[t as keyof (typeof RELATION_TEN_GOD_COPY)[string]];
      assert.ok(v && v.length > 0, `${r}/${t} 비어있음`);
    }
  }
});

test("relationTenGodCopy 정상 룩업", () => {
  assert.equal(relationTenGodCopy("friend", "정관"), "믿고 기댈 친구");
  assert.equal(relationTenGodCopy("lover", "편관"), "자꾸 밀당하게 되는 상대");
  assert.equal(relationTenGodCopy("senior", "편인"), "영감을 주는 멘토");
});

test("relationTenGodCopy 미지 relationType → null", () => {
  assert.equal(relationTenGodCopy("unknown", "정관"), null);
});

test("relationTenGodCopy 미지 tenGod → null(크래시 금지)", () => {
  assert.equal(relationTenGodCopy("friend", "칠살"), null);
});
