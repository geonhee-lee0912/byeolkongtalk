// lib/claude.sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), "data", "persona", f), "utf-8");

test("doll_partner.md — 인형 역할극 + 가드레일 존재, 별콩이 정체성은 없음", () => {
  const doll = read("doll_partner.md");
  assert.ok(/인형/.test(doll), "인형 역할 규칙");
  assert.ok(/자해|유해|잔인/.test(doll), "가드레일(유해·자해조장 금지)");
  assert.ok(!/별콩이/.test(doll), "인형은 별콩이가 아니어야 — 별콩이 언급 금지");
});
