import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGenericReportJson } from "./generic-report.ts";

const base = {
  intro: "도입부 문장이다.",
  sections: [{ heading: "🌱 타고난 나", body: "본문이다." }],
  note: "따뜻한 한마디.",
};

test("parseGenericReportJson: 정상 daeunLines 파싱", () => {
  const r = parseGenericReportJson(
    JSON.stringify({
      ...base,
      daeunLines: [
        { startAge: 3, line: "첫 대운 한 줄." },
        { startAge: 13, line: "두 번째 대운 한 줄." },
      ],
    })
  );
  assert.equal(r?.daeunLines?.length, 2);
  assert.deepEqual(r?.daeunLines?.[0], { startAge: 3, line: "첫 대운 한 줄." });
});

test("parseGenericReportJson: daeunLines null → 필드 없음", () => {
  const r = parseGenericReportJson(JSON.stringify({ ...base, daeunLines: null }));
  assert.notEqual(r, null);
  assert.equal(r?.daeunLines, undefined);
});

test("parseGenericReportJson: daeunLines 키 없어도 하위호환", () => {
  const r = parseGenericReportJson(JSON.stringify(base));
  assert.notEqual(r, null);
  assert.equal(r?.daeunLines, undefined);
});

test("parseGenericReportJson: 망가진 항목은 걸러낸다", () => {
  const r = parseGenericReportJson(
    JSON.stringify({
      ...base,
      daeunLines: [
        { startAge: 5, line: "유효." },
        { startAge: 15 }, // line 없음
        { startAge: "x", line: "startAge 문자열" }, // startAge 비정수
        { line: "startAge 없음" },
      ],
    })
  );
  assert.deepEqual(r?.daeunLines, [{ startAge: 5, line: "유효." }]);
});
