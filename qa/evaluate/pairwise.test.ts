// qa/evaluate/pairwise.test.ts
// 파싱·언블라인드 순수 로직만 단위 테스트 (실 judge 호출 없음).
// NOTE: 플랜 스니펫은 vitest 로 적혀 있으나 이 리포 러너는 node:test.
// qa/ 아래라 CI 는 제외 — 로컬 `node --import tsx --env-file=.env.local --test` 로 실행
// (pairwise.ts 가 judge.ts 처럼 모듈 로드 시 Anthropic 클라이언트를 만들어 CLAUDE_API_KEY 필요).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePairwise, unblind } from "./pairwise.ts";

describe("pairwise", () => {
  it("winner A/B 를 원 라벨로 언블라인드 (위치 무작위 대응)", () => {
    assert.equal(unblind("A", { A: "baseline", B: "candidate" }), "baseline");
    assert.equal(unblind("B", { A: "baseline", B: "candidate" }), "candidate");
    // 슬롯이 뒤집혔을 때(A=candidate)도 원 라벨로 되돌리는가
    assert.equal(unblind("A", { A: "candidate", B: "baseline" }), "candidate");
    assert.equal(unblind("tie", { A: "baseline", B: "candidate" }), "tie");
  });
  it("judge JSON 파싱", () => {
    const r = parsePairwise('{"winner":"A","reason":"더 따뜻함"}');
    assert.equal(r.winner, "A");
    assert.ok(r.reason.includes("따뜻"));
  });
  it("코드펜스 감싼 JSON 도 파싱", () => {
    const r = parsePairwise('```json\n{"winner":"B","reason":"답 먼저"}\n```');
    assert.equal(r.winner, "B");
  });
  it("파싱 실패 시 tie + 사유", () => {
    assert.equal(parsePairwise("garbage").winner, "tie");
  });
});
