import { test } from "node:test";
import assert from "node:assert/strict";
import { BIRTH_PROMPT_SURFACE } from "./birth-prompt-surface.ts";

test("surface 값은 서로 겹치지 않는다 — 겹치면 자리별로 갈라 볼 수 없다", () => {
  const values = Object.values(BIRTH_PROMPT_SURFACE);
  assert.equal(new Set(values).size, values.length);
});

test("surface 는 스펙 §4-4 의 6곳이다", () => {
  assert.deepEqual(Object.values(BIRTH_PROMPT_SURFACE).sort(), [
    "byeolmaru_day_saju",
    "byeolmaru_day_tarot",
    "byeolmaru_day_woori",
    "byeolmaru_hub",
    "fortune_header",
    "fortune_picker",
  ]);
});
