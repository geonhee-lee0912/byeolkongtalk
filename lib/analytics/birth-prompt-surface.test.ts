import { test } from "node:test";
import assert from "node:assert/strict";
import { BIRTH_PROMPT_SURFACE } from "./birth-prompt-surface.ts";

test("surface 값은 서로 겹치지 않는다 — 겹치면 자리별로 갈라 볼 수 없다", () => {
  const values = Object.values(BIRTH_PROMPT_SURFACE);
  assert.equal(new Set(values).size, values.length);
});

test("surface 는 스펙 §4-4 의 6곳이고, 키와 값이 짝째로 고정이다", () => {
  // 🔴 값만 정렬해 비교하면 두 자리의 값이 서로 바뀌어도 통과한다 — 그게 바로 추세를 끊는 변경이다.
  assert.deepEqual(BIRTH_PROMPT_SURFACE, {
    fortunePicker: "fortune_picker",
    fortuneHeader: "fortune_header",
    byeolmaruHub: "byeolmaru_hub",
    byeolmaruDaySaju: "byeolmaru_day_saju",
    byeolmaruDayWoori: "byeolmaru_day_woori",
    byeolmaruDayTarot: "byeolmaru_day_tarot",
  });
});
