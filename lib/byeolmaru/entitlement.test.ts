import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEntitlement, TRIAL_DAYS } from "./entitlement.ts";

const NOW = new Date("2026-09-04T12:00:00Z");

test("구독도 체험도 없으면 비자격", () => {
  const e = computeEntitlement({ trialStartedAt: null, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.reason, "none");
  assert.equal(e.trialUsed, false);
});

test("체험 시작 후 3일 이내면 자격(trial)", () => {
  const started = new Date(NOW.getTime() - 2 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.reason, "trial");
  assert.equal(e.trialUsed, true);
  assert.ok(e.trialEndsAt);
});

test("체험 3일 경과면 비자격이지만 trialUsed=true", () => {
  const started = new Date(NOW.getTime() - (TRIAL_DAYS + 1) * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: null }, NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.reason, "none");
  assert.equal(e.trialUsed, true);
});

test("활성 구독이 있으면 체험 여부와 무관하게 자격(subscription)", () => {
  const future = new Date(NOW.getTime() + 10 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: null, subscriptionExpiresAt: future }, NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.reason, "subscription");
  assert.equal(e.subscriptionExpiresAt, future);
});

test("구독이 우선 — 체험 만료 + 활성 구독이면 subscription", () => {
  const started = new Date(NOW.getTime() - 100 * 86400000).toISOString();
  const future = new Date(NOW.getTime() + 5 * 86400000).toISOString();
  const e = computeEntitlement({ trialStartedAt: started, subscriptionExpiresAt: future }, NOW);
  assert.equal(e.reason, "subscription");
});
