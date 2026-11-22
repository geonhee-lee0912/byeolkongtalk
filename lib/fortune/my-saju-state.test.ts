import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mySajuState } from "./my-saju-state.ts";

const saved = { isPrimary: true, saju: { dayStem: "갑" } };

test("비로그인이 확실할 때만 선물 칸", () => {
  assert.equal(mySajuState(false, null), "anon");
});

test("프로필을 못 불러오면 '생일 없음'이 아니라 오류", () => {
  assert.equal(mySajuState(true, null), "error");
  assert.equal(mySajuState(undefined, null), "error");
});

test("불러왔는데 생일이 없으면 null, 있으면 그 프로필", () => {
  assert.equal(mySajuState(true, []), null);
  assert.equal(mySajuState(true, [{ isPrimary: true, saju: null }]), null);
  assert.equal(mySajuState(true, [saved]), saved);
});

test("운세 첫 칸이 이 판정을 쓰고, 오류면 '생일을 알려줘'를 그리지 않는다", () => {
  const s = readFileSync("components/fortune/MySajuRow.tsx", "utf8");
  assert.match(s, /mySajuState\(/);
  assert.match(s, /if \(self === "error"\) return null;/);
});
