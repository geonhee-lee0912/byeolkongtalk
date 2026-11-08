// 설계 §8 — 문구 틀 계약: 광고 틀은 제목·본문이 "(광고)"로 시작하고 끝에 수신거부가 있다. 정보성 틀엔 판촉 단어가 없다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adMessage, AD_FOOTER, SUPPORT_CONTACT } from "./ad-templates.ts";

test("광고 틀 — (광고) 로 시작, 끝에 무료 수신거부·고객센터", () => {
  const m = adMessage("오늘 흐름", "한 줄");
  assert.ok(m.title.startsWith("(광고) "));
  assert.ok(m.body.startsWith("(광고) "));
  assert.ok(m.body.endsWith(AD_FOOTER));
  assert.ok(AD_FOOTER.includes("무료 수신거부"));
  assert.ok(AD_FOOTER.includes("수신거부"));
  assert.ok(AD_FOOTER.includes(SUPPORT_CONTACT));
  for (const bad of ["[광고]", "(AD)", "(Ad)"]) assert.ok(!m.title.includes(bad) && !m.body.includes(bad));
});
