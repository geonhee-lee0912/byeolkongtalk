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

test("byeolkong_sim.md — 시뮬 고유만 담고 코어 안전망은 복사 안 함", () => {
  const sim = read("byeolkong_sim.md");
  assert.ok(/노트|디브리핑|보낼 말/.test(sim), "시뮬 고유(노트·디브리핑) 규칙");
  assert.ok(/\[SEND:/.test(sim), "보낼 말 [SEND:] 마커 규칙");
  // 코어 hotline 번호를 오버레이에 복사하면 드리프트 — 계승만(로더가 코어 합성).
  assert.ok(!/109|1388|1366/.test(sim), "hotline 번호를 오버레이에 복사 금지(코어 계승)");
});
