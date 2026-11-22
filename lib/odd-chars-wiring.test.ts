// 계약: 깨진 글자 거르기가 타로 화면·저장본·다음 턴 입력과 운세 리포트에 실제로 걸려 있다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptReplacement } from "./odd-chars-repair.ts";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

test("고친 낱말은 짧은 한국어만 받는다", () => {
  assert.equal(acceptReplacement(" 불분명 "), "불분명");
  assert.equal(acceptReplacement('"전화로"'), "전화로");
  for (const no of ["", "-", "없음", "текущ", "unclear", "당첨", "복권 사이트", "조건이 불분명하거나 설명과 실제 업무가 다른 곳은 제외", "109"]) {
    assert.equal(acceptReplacement(no), null, no);
  }
});

test("타로 — 모델 글은 거른 뒤에만 독백 필터(화면·저장본의 기준)로 들어간다", () => {
  const s = src("app/api/consultations/tarot/chat/route.ts");
  assert.match(s, /holdFilter\.push\(await oddFilter\.push\(/);
  assert.match(s, /await oddFilter\.flush\(\)/);
  assert.match(s, /repairOddWord/);
});

test("타로 — 다음 턴 입력에서도 지운다", () => {
  assert.match(src("app/api/consultations/tarot/chat/route.ts"), /stripLeakedMonologue\(scrubOddChars\(m\.content/);
});

test("운세 — 리포트 생성은 전부 거르는 길로만", () => {
  const s = src("app/api/fortune/create/route.ts");
  assert.match(s, /generateWithoutOddChars\(/);
  assert.equal(s.match(/await generateOnce\(/g), null);
});
