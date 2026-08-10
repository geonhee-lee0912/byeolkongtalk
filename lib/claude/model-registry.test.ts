// lib/claude/model-registry.test.ts
// NOTE: 플랜 스니펫은 vitest 로 적혀 있으나, 이 리포의 유닛 테스트 러너는 node:test 다
// (전 테스트 파일 + .github/workflows/test.yml 이 `node --import tsx --test` 로 실행). 케이스는 동일.
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { providerOf, resolveChatModel, CHAT_MODEL } from "./model-registry.ts";

describe("model-registry", () => {
  afterEach(() => {
    delete process.env.QA_CHAT_MODEL;
  });

  it("기본은 sonnet-5 (anthropic)", () => {
    assert.equal(resolveChatModel(undefined), "claude-sonnet-5");
    assert.equal(providerOf("claude-sonnet-5"), "anthropic");
  });
  it("QA_CHAT_MODEL 이 최우선 오버라이드", () => {
    process.env.QA_CHAT_MODEL = "gpt-5-mini";
    assert.equal(resolveChatModel("claude-sonnet-5"), "gpt-5-mini");
  });
  it("provider 매핑", () => {
    assert.equal(providerOf("gpt-5-mini"), "openai");
    assert.equal(providerOf("gpt-5-nano"), "openai");
    assert.equal(providerOf("gpt-5.6-luna"), "openai");
    assert.equal(providerOf("gemini-3.6-flash"), "gemini");
    assert.equal(providerOf("gemini-3-flash-preview"), "gemini");
  });
  it("미등록 model 은 throw", () => {
    assert.throws(() => providerOf("unknown-x"));
  });
  it("CHAT_MODEL 은 등록된 openai 모델", () => {
    assert.equal(providerOf(CHAT_MODEL), "openai");
  });
});
