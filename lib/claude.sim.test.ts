// lib/claude.sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDollSystemMessage, buildSimByeolkongMessage } from "./claude.ts";
import { getSituation } from "./relationship/situations.ts";

const read = (f: string) => readFileSync(join(process.cwd(), "data", "persona", f), "utf-8");

test("doll_partner.md — 인형 역할극 + 가드레일 존재, 별콩이 정체성은 없음", () => {
  const doll = read("doll_partner.md");
  assert.ok(/인형/.test(doll), "인형 역할 규칙");
  assert.ok(/자해|유해|잔인/.test(doll), "가드레일(유해·자해조장 금지)");
  assert.ok(!/별콩이/.test(doll), "인형은 별콩이가 아니어야 — 별콩이 언급 금지");
});

test("byeolkong_sim.md — 시뮬 고유만 담고 코어 안전망은 복사 안 함", () => {
  const sim = read("byeolkong_sim.md");
  assert.ok(/노트|디브리핑|보낼 말/.test(sim), "시뮬 고유(노트·디브리핑) 규칙");
  assert.ok(/\[SEND:/.test(sim), "보낼 말 [SEND:] 마커 규칙");
  // 코어 hotline 번호를 오버레이에 복사하면 드리프트 — 계승만(로더가 코어 합성).
  assert.ok(!/109|1388|1366/.test(sim), "hotline 번호를 오버레이에 복사 금지(코어 계승)");
});

test("인형 빌더 — 상황 seed·프로필·유저맥락 주입 + staticPart 는 별콩이 아님", () => {
  const s = getSituation("breakup-reconnect")!;
  const { staticPart, dynamicPart } = buildDollSystemMessage({
    situation: s, partnerName: "민준", statusLabel: "헤어진 사이",
    profileLine: "관계: 헤어진 사이\nMBTI: INFJ", userContext: "3개월 전 헤어짐",
  });
  assert.ok(dynamicPart.includes(s.dollStance), "dollStance 주입");
  assert.ok(dynamicPart.includes("민준"), "상대 이름 주입");
  assert.ok(dynamicPart.includes("3개월 전 헤어짐"), "유저 맥락 주입");
  assert.ok(!/별의 수호자/.test(staticPart), "인형 staticPart 에 별콩이 코어 없음(격리 §5)");
});

test("별콩이 시뮬 빌더 — 모드별 가이드 + 코어 계승 + 대화 블록", () => {
  const s = getSituation("crush-confess")!;
  const base = { situation: s, partnerName: "지우", statusLabel: "썸 타는 중", userContext: null,
    convoBlock: "유저: 안녕\n인형: 어 왜" };
  const debrief = buildSimByeolkongMessage({ ...base, mode: "debrief" });
  const suggest = buildSimByeolkongMessage({ ...base, mode: "suggest" });
  const crisis = buildSimByeolkongMessage({ ...base, mode: "crisis" });
  assert.ok(/별의 수호자/.test(debrief.staticPart), "별콩이 staticPart 는 코어 계승");
  assert.ok(debrief.dynamicPart.includes("유저: 안녕"), "대화 블록 주입");
  assert.ok(/디브리핑|보낼 말/.test(debrief.dynamicPart), "debrief 모드 가이드");
  assert.ok(/추천|SAY/.test(suggest.dynamicPart), "suggest 모드 가이드");
  assert.ok(/위기/.test(crisis.dynamicPart), "crisis 모드 가이드");
});
