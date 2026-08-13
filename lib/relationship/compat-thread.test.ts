import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCompatForModel } from "./compat-thread.ts";
import { buildCompatReport, serializeCompatReport } from "@/lib/fortune/compat-report";
import type { ThreadMsg } from "./memory.ts";

const sampleReport = serializeCompatReport(
  buildCompatReport({
    grade: "좋은 인연",
    theme: "서로 배우는 사이",
    summary: "두 일간이 만나 만드는 흐름.",
    chemistry: "오행 케미 설명.",
    attraction: "끌림 설명.",
    conflict: "갈등 설명.",
    communication: "대화법 설명.",
    longterm: "장기 전망 설명.",
    growth: "관계 성장 포인트 설명.",
    advice: ["실천1", "실천2", "실천3"],
    note: "별콩이 한마디.",
  })
);

test("redactCompatForModel — compat JSON assistant 메시지를 짧은 자연어로 치환", () => {
  const rows: ThreadMsg[] = [
    { role: "user", content: "궁합 어때?" },
    { role: "assistant", content: sampleReport },
  ];
  const out = redactCompatForModel(rows);
  assert.equal(out.length, 2); // 길이 불변(치환, 필터 아님)
  assert.equal(out[0].content, "궁합 어때?"); // user 원문 유지
  assert.equal(out[1].role, "assistant"); // role 불변
  assert.ok(!out[1].content.startsWith("{")); // JSON 아님
  assert.ok(out[1].content.includes("좋은 인연")); // 등급 포함
  assert.ok(out[1].content.includes("서로 배우는 사이")); // 테마 포함
});

test("redactCompatForModel — 일반 메시지는 그대로 통과", () => {
  const rows: ThreadMsg[] = [
    { role: "assistant", content: "그냥 평범한 답장이야." },
    { role: "user", content: "{이건 JSON 아님}" },
  ];
  const out = redactCompatForModel(rows);
  assert.equal(out[0].content, "그냥 평범한 답장이야.");
  assert.equal(out[1].content, "{이건 JSON 아님}");
});
