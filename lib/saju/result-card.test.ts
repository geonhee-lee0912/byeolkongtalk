// 계약: 사주 상담 결과의 한마디 카드는 타로 결과와 같은 모양(운영자 11-22 시안14 A)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = (f: string) => {
  const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  return s.slice(s.indexOf("{closingLine && ("), s.indexOf("{revisit(true)}")).replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // 주석은 빼고 본다
};

test("사주 한마디 카드 — ❝ 장식 없이, **는 강조로, 본문 15", () => {
  const saju = card("app/(consultations)/saju/result/page.tsx");
  assert.ok(!saju.includes("❝"));
  assert.match(saju, /<p className="text-15 text-eye-purple leading-relaxed">\n\s*<EmphasisText text=\{closingLine\} \/>/);
  assert.match(saju, /<div className="bg-white rounded-2xl shadow-card p-5">/);
});

test("사주와 타로의 한마디 카드 마크업이 같다(주석 빼고)", () => {
  const plain = (s: string) => s.replace(/\s+/g, " ");
  assert.equal(plain(card("app/(consultations)/saju/result/page.tsx")), plain(card("app/tarot/result/page.tsx")));
});
