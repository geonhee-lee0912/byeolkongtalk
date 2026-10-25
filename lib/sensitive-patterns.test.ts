import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { concernSafetyMatch, detectSensitiveSync, type SensitiveCategory } from "./sensitive-patterns.ts";
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

// ── high 정규식 권장안 (2026-10-11 prod 조사) ──
// 3개월 prod 에서 regex high 로 즉시 확정된 17건 중 급성 위기는 0, 패턴 의도와 다른 오탐이 14건이었다
// (약속·약간·청약·감기약 / 프사에 사진 올려 / 관계 유지 / 재회에 목매 / 차에서 뛰어내리겠다고). high 가 되면 그 리딩은 끝까지 위기 모드(매 턴 상담전화·마무리 억제·공유 차단)다.
// 거꾸로 진짜 위기 문장("수면제 한 통 다 먹었어"·"목을 매고 싶어")은 한글 활용형 때문에 null 이었다.
// 아래 문장은 실문장의 구조만 살린 합성문이다(고객 문장을 코드에 남기지 않는다)
const certaintyOf = (text: string) => detectSensitiveSync(text)?.certainty ?? null;

test("진짜 위기 문장은 high — 옛 정규식이 활용형·어순 때문에 놓치던 것까지", () => {
  const crisis: Array<[string, SensitiveCategory]> = [
    ["수면제 한 통 다 먹었어", "suicide"],
    ["약을 한꺼번에 다 삼켰어", "suicide"],
    ["수면제 모아 놨어", "suicide"],
    ["약 먹고 그냥 안 깨어났으면 좋겠어", "suicide"],
    ["약 왕창 먹고 죽을까 생각했어", "suicide"],
    // 옛 패턴이 '약' 부분문자열로 우연히 잡던 것 — 어절 경계를 세우면서 잃으면 안 되는 자살 수단·표기
    ["농약 먹고 죽을까", "suicide"],
    ["알약을 한 움큼 삼켰어", "suicide"],
    ["약으로 죽으려고 모아놨어", "suicide"],
    ["수면제먹고 죽을래", "suicide"], // 띄어쓰기 없이 붙여 쓴 동사
    ["목을 매고 싶어", "suicide"],
    ["한강 가서 뛰어내릴까", "suicide"],
    ["옥상에서 뛰어내리고 싶어", "suicide"],
    ["강제로 만졌어", "sexual_violence"],
    ["남친이 억지로 관계를 가졌어", "sexual_violence"],
    ["영상 올리겠다고 협박해", "sexual_violence"],
    ["헤어지자니까 내 사진 유포한다고 협박해", "sexual_violence"],
    ["전 남친이 영상 뿌린대", "sexual_violence"],
    ["영상을 퍼트린다고 협박했어", "sexual_violence"],
    ["반 애들이 나를 괴롭혀", "school_violence"],
    ["친구들이 날 괴롭혔어", "school_violence"], // 과거형 — '괴롭혀' 만 적으면 놓친다
    ["친구들이 날 따돌려", "school_violence"],
  ];
  for (const [text, category] of crisis) {
    const m = detectSensitiveSync(text);
    assert.equal(m?.certainty, "high", `high 여야 한다: ${text}`);
    assert.equal(m?.category, category, `카테고리: ${text}`);
  }
});

test("'약' 은 어절 경계가 있어야 약이다 — 약속·약간·청약·계약·약국·약해 는 위기 후보도 아니다", () => {
  const notMedicine = [
    "썸 타는 사람이랑 약속 잡고 밥 먹고 왔는데 걔 마음이 궁금해",
    "약간 서운했던 거 다 털어놓고 싶어",
    "청약 당첨되면 돈 모아서 같이 살자고 했어",
    "계약직이라 불안한데 연락도 없고 밥도 못 먹고 있어",
    "약국 들렀다가 친구랑 밥 먹고 왔어",
    "너도 아프지말고 약잘먹고 집에 빨리 들어가", // 띄어쓰기 없는 실문장 구조 — '약' 뒤 '잘' 은 경계가 아니다
    "내가 너무 약해서 마음 먹고도 연락을 못 했어",
  ];
  for (const text of notMedicine) assert.equal(certaintyOf(text), null, text);
});

test("prod 오탐 구조의 문장은 high 가 아니다 — 위기 모드로 안 간다", () => {
  const notHigh = [
    "재회에 목매는 내가 싫어",
    "그 사람한테 목 매지 말라고 친구가 그러더라",
    "프사에 커플 사진 올려 놨더라",
    "스토리에 사진 올려놨던데 나한테는 연락이 없어",
    "관계를 유지하기보다 억지로 맞추는 느낌이야",
    "억지로 연락 이어가는 관계는 싫어",
    "그 사람이 차에서 뛰어내리겠다고 해서 놀랐어",
    "그 사람이 차에서 뛰어내린다고 해서 놀랐어",
    "친구들이 걔를 무시하는 것 같아",
    "친구들 만나도 마음이 괴롭다",
    "감기약 먹고 일찍 잤어",
  ];
  for (const text of notHigh) assert.notEqual(certaintyOf(text), "high", text);
});

test("애매한 말은 null 이 아니라 medium — 스트림 전 AI 2차 판정이 가린다", () => {
  const gray: Array<[string, SensitiveCategory]> = [
    ["감기약 먹고 일찍 잤어", "suicide"],
    ["요즘 잠이 안 와서 수면제 먹고 겨우 잤어", "suicide"],
    ["약먹고 잤어", "suicide"],
    ["그 사람이 차에서 뛰어내리겠다고 해서 놀랐어", "suicide"],
    ["프사에 커플 사진 올려 놨더라", "sexual_violence"],
    ["억지로 시켜서 했어", "sexual_violence"], // 옛 패턴의 '시켜' — 일상어가 더 흔해 high 는 아니지만 AI 가 볼 기회는 남긴다
    ["친구들이 걔를 무시하는 것 같아", "school_violence"],
  ];
  for (const [text, category] of gray) {
    const m = detectSensitiveSync(text);
    assert.equal(m?.certainty, "medium", `medium 이어야 한다: ${text}`);
    assert.equal(m?.category, category, `카테고리: ${text}`);
  }
});

test("'목을 매' 는 집착 관용구로도 흔하다 — 행위·의도가 붙을 때만 high", () => {
  assert.equal(certaintyOf("그 사람한테 목을 매는 내가 싫어"), "medium"); // 옛 패턴은 '을' 이 끼면 못 잡았다 — 새로 high 가 되면 안 된다
  assert.equal(certaintyOf("목을 매달고 싶다는 생각까지 했어"), "high");
  assert.equal(certaintyOf("목 매고 죽을까"), "high");
});

test("바꾸지 않은 위기 패턴은 그대로", () => {
  const same: Array<[string, SensitiveCategory, "high" | "medium"]> = [
    ["죽고 싶어", "suicide", "high"],
    ["자해", "suicide", "high"],
    ["왕따", "school_violence", "high"],
    ["집에 들어가기 무서워", "domestic_violence", "high"],
    ["성추행 당했어", "sexual_violence", "high"],
    ["나 살기 싫어", "suicide", "medium"],
  ];
  for (const [text, category, certainty] of same) {
    const m = detectSensitiveSync(text);
    assert.equal(m?.category, category, text);
    assert.equal(m?.certainty, certainty, text);
  }
});

test("고민 쓰기 배너(concernSafetyMatch)는 high 만 — 위기 문장엔 뜨고 일상 문장엔 안 뜬다", () => {
  assert.equal(concernSafetyMatch("수면제 한 통 다 먹었어")?.category, "suicide");
  assert.equal(concernSafetyMatch("목을 매고 싶어")?.category, "suicide");
  for (const text of ["감기약 먹고 일찍 잤어", "프사에 커플 사진 올려 놨더라", "친구들이 걔를 무시하는 것 같아", "약속 잡고 밥 먹고 왔어"]) {
    assert.equal(concernSafetyMatch(text), null, text);
  }
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
