import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// 계약 — 이 모듈은 고민 쓰기 화면(클라이언트)이 가져간다. lib/sensitive.ts 는 Anthropic SDK·service 클라이언트를 import 하므로
// 패턴 모듈이 뭐든 import 하면(그 파일을 다시 가져오는 순간 포함) 서버 전용 코드와 키가 브라우저 번들로 딸려 들어간다 — 그래서 import 를 0 으로 고정한다.
// 주석 속 단어는 import 가 아니니 뺀다(`menu-session.test.ts` 와 같은 관용구)
test("sensitive-patterns 는 아무것도 import 하지 않는다 — 클라이언트가 가져가는 순수 모듈", () => {
  const code = readFileSync(new URL("./sensitive-patterns.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // 주석을 걷어 낸 소스가 멀쩡한지 — 걷다가 본문까지 지워 빈 스캔으로 통과하지 않게
  assert.ok(code.includes("export function detectSensitiveSync") && code.includes("const PATTERNS"), "주석 제거가 본문을 지웠다 — 이 계약의 스캔이 비었다");
  const forms: Array<[string, RegExp]> = [
    ["줄 시작 import(import type 포함)", /^\s*import\b/m],
    ["require( 호출", /\brequire\s*\(/],
    ["동적 import(", /\bimport\s*\(/],
    ["export … from 재수출", /\bfrom\s*["']/],
  ];
  const found = forms.filter(([, re]) => re.test(code)).map(([label]) => label);
  assert.deepEqual(
    found,
    [],
    `lib/sensitive-patterns.ts 에 ${found.join(" · ")} 이 있다 — 고민 쓰기 화면(클라이언트)이 이 모듈을 가져가므로, 서버 전용 모듈(lib/sensitive.ts 의 Anthropic SDK·service 클라이언트)이 딸려 들어오지 않게 import 를 두지 말 것`
  );
});
