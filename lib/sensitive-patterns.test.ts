import { test } from "node:test";
import assert from "node:assert/strict";
import { concernSafetyMatch, detectSensitiveSync } from "./sensitive-patterns.ts";
import * as server from "./sensitive.ts";

test("서버 모듈이 같은 함수를 다시 내보낸다 — 정규식 원천은 하나", () => {
  assert.equal(server.detectSensitiveSync, detectSensitiveSync);
});

test("concernSafetyMatch — 정규식 확신 high 만 배너(회색지대는 로그인 뒤 첫 대화의 AI 2차 판정이 맡는다)", () => {
  assert.equal(concernSafetyMatch("요즘 너무 죽고 싶어")?.category, "suicide");
  assert.equal(concernSafetyMatch("집에 들어가기 무서워 아빠가 때려")?.category, "domestic_violence");
  assert.equal(concernSafetyMatch("힘들어 죽겠어 진짜"), null); // low
  assert.equal(concernSafetyMatch("나와 끝내고 싶은건지 모르겠어"), null); // medium(이별 오탐 실문장)
  assert.equal(concernSafetyMatch("걔가 요즘 연락이 뜸해서 마음이 쓰여"), null);
});
