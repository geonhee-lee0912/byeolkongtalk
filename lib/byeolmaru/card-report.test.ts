// lib/byeolmaru/card-report.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_REPORT_BLOCKS,
  CARD_REPORT_SCHEMA,
  parseCardReportJson,
  buildCardReport,
  isCardReport,
  type CardReportAI,
} from "./card-report.ts";

const AI: CardReportAI = {
  place: "**바보 카드가** 오늘 병신 일진 위에 떨어졌어.",
  love: "**연락 하나가** 온다.",
  work: "**일에선** 가볍게.",
  mind: "**마음은** 열려 있어.",
  caution: "**서두르지** 마.",
  move: "**한 걸음만** 떼자.",
  note: "오늘도 네 편이야.",
};
const GAUGE = { love: { base: 63, delta: 6 }, money: { base: 40, delta: 6 }, work: { base: 55, delta: 6 } };

test("CARD_REPORT_BLOCKS: 7블록 순서·키가 스펙 §6-2 표와 같다", () => {
  assert.deepEqual(
    CARD_REPORT_BLOCKS.map((b) => b.key),
    ["place", "love", "work", "mind", "caution", "move", "note"]
  );
  assert.equal(CARD_REPORT_BLOCKS[0].title, "이 카드가 온 자리");
  assert.equal(CARD_REPORT_BLOCKS[3].title, "카드가 비추는 마음");
  // P6-2 Task10(2026-09-20) 실측 조정으로 36→39(caution·move·note 각 +1, card-report.ts 주석 참조).
  assert.equal(CARD_REPORT_BLOCKS.reduce((a, b) => a + b.sentences, 0), 39, "§6-2 예산 36문장에서 실측 조정 +3 = 39문장 × 50자 ≈ 1,950자");
});

test("CARD_REPORT_SCHEMA: 7키 전부 required 인 strict object", () => {
  assert.equal(CARD_REPORT_SCHEMA.additionalProperties, false);
  const keys = CARD_REPORT_BLOCKS.map((b) => b.key);
  assert.deepEqual(
    Object.keys(CARD_REPORT_SCHEMA.properties),
    keys,
    "스키마 properties 가 7블록과 어긋나면 strict 가 새 키를 금지해 전건 파싱 실패한다"
  );
  assert.deepEqual([...CARD_REPORT_SCHEMA.required], keys, "required 가 7블록과 어긋남");
});

test("parseCardReportJson: 정상 JSON → 7필드 trim + note 머리말 제거", () => {
  const raw = JSON.stringify({ ...AI, note: "별콩이의 한마디: 오늘도 네 편이야. " });
  const out = parseCardReportJson(raw)!;
  assert.equal(out.note, "오늘도 네 편이야.");
  assert.equal(out.place, AI.place);
});

test("parseCardReportJson: 코드펜스·잡텍스트가 섞여도 파싱된다", () => {
  const raw = "```json\n" + JSON.stringify(AI) + "\n```\n감사합니다";
  assert.ok(parseCardReportJson(raw));
});

test("parseCardReportJson: 필드 하나라도 비면 null(7블록 전부 있어야 리포트다)", () => {
  assert.equal(parseCardReportJson(JSON.stringify({ ...AI, mind: "" })), null);
  const { caution: _omit, ...missing } = AI;
  void _omit;
  assert.equal(parseCardReportJson(JSON.stringify(missing)), null);
  assert.equal(parseCardReportJson("이건 JSON 이 아니야"), null);
});

test("buildCardReport / isCardReport: v:1 + 카드·게이지 병합, 캐시에서 읽은 값 검증", () => {
  const r = buildCardReport(AI, { cardId: 0, reversed: false, gauge: GAUGE });
  assert.equal(r.v, 1);
  assert.equal(r.cardId, 0);
  assert.equal(r.gauge.love.delta, 6);
  assert.equal(r.blocks.place, AI.place);
  assert.ok(isCardReport(r));
  assert.ok(isCardReport(JSON.parse(JSON.stringify(r))));
  assert.equal(isCardReport({ ...r, v: 2 }), false, "포맷 버전 불일치는 미스(§11-1-3)");
  assert.equal(isCardReport("옛 자유 줄글"), false);
  assert.equal(isCardReport(null), false);
  assert.equal(isCardReport({ ...r, blocks: { ...r.blocks, note: "" } }), false);
  assert.equal(isCardReport({ ...r, gauge: { ...r.gauge, money: { base: 40 } } }), false, "게이지 축 형태 불일치도 미스");
});
