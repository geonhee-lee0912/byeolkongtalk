import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAIR_REPORT_BLOCKS,
  PAIR_REPORT_SCHEMA,
  parsePairReportJson,
  buildPairReport,
  isPairReport,
} from "./pair-report.ts";
import { PAIR_PAID_SECTIONS, PAIR_PAID_CHARS } from "./paywall-sections.ts";

const FULL = {
  today: "오늘 본문",
  scene: "장면 본문",
  grain: "결 본문",
  timing: "타이밍 본문",
  note: "마무리 본문",
};

test("스키마와 블록 정의가 어긋나지 않는다 — 한쪽만 고치면 여기서 잡힌다", () => {
  // 🔴 스키마에만 있고 프롬프트/블록에 없는 키는 모델이 빈 값으로 채우고 파서가 통째로 null 을
  //    돌린다(부분 리포트를 저장하지 않으므로). 두 정의가 갈리지 않는지 대조한다.
  const blockKeys = PAIR_REPORT_BLOCKS.map((b) => b.key).sort();
  assert.deepEqual(Object.keys(PAIR_REPORT_SCHEMA.properties).sort(), blockKeys);
  assert.deepEqual([...PAIR_REPORT_SCHEMA.required].sort(), blockKeys);
  assert.equal(PAIR_REPORT_SCHEMA.additionalProperties, false, "strict 스키마는 추가 키를 막아야 한다");
});

test("절단선 칩(PAIR_PAID_SECTIONS)은 블록 제목에서 파생된다 — 하드코딩이면 낡아서 거짓말이 된다", () => {
  assert.deepEqual([...PAIR_PAID_SECTIONS], PAIR_REPORT_BLOCKS.map((b) => b.title));
  // 목표 글자수가 정본, 문장 수는 수단(card-report.ts P6-2 Task10 교훈).
  assert.equal(PAIR_REPORT_BLOCKS.reduce((n, b) => n + b.sentences, 0) * 50, PAIR_PAID_CHARS);
});

test("parsePairReportJson: 5블록 전부 있으면 통과, 하나라도 비면 null(부분 저장 금지)", () => {
  const ok = parsePairReportJson(JSON.stringify(FULL));
  assert.ok(ok);
  assert.equal(ok.today, "오늘 본문");

  for (const k of Object.keys(FULL)) {
    const partial = { ...FULL, [k]: "" };
    assert.equal(parsePairReportJson(JSON.stringify(partial)), null, `${k} 가 비면 null 이어야 한다`);
    const missing = { ...FULL } as Record<string, string>;
    delete missing[k];
    assert.equal(parsePairReportJson(JSON.stringify(missing)), null, `${k} 가 없으면 null 이어야 한다`);
  }
  assert.equal(parsePairReportJson("не json"), null);
  assert.equal(parsePairReportJson(""), null);
});

test("parsePairReportJson: note 머리말은 벗겨내고 본문은 trim 한다", () => {
  const r = parsePairReportJson(JSON.stringify({ ...FULL, note: "별콩이의 한마디: 잘 자", today: "  여백  " }));
  assert.ok(r);
  assert.ok(!r.note.startsWith("별콩이의 한마디"), `머리말이 안 벗겨졌다: ${r.note}`);
  assert.equal(r.today, "여백");
});

test("isPairReport: 버전·5블록을 본다 — 구버전 캐시 행은 미스로 떨어져야 한다", () => {
  const good = buildPairReport(FULL);
  assert.ok(isPairReport(good));

  assert.equal(isPairReport(null), false);
  assert.equal(isPairReport("자유 줄글 시절 캐시"), false, "구 TEXT 캐시가 통과하면 안 된다");
  assert.equal(isPairReport({ ...good, v: 2 }), false, "포맷 버전이 다르면 미스");
  assert.equal(isPairReport({ v: good.v }), false, "blocks 없으면 미스");
  assert.equal(isPairReport({ v: good.v, blocks: { ...FULL, timing: "" } }), false, "빈 블록이 있으면 미스");
});
