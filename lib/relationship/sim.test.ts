// lib/relationship/sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSuggestWrap, simForceDebrief, extractSendLine, stripSimMarkers,
  buildSimContextBlock, formatPartnerForDoll, appendPersonalityNote,
} from "./sim.ts";
import { SIM_TURN_CAP } from "./types.ts";

test("소프트 수렴 유도 — 후반부(cap-3)부터 정리 권유", () => {
  assert.equal(shouldSuggestWrap(SIM_TURN_CAP - 4), false);
  assert.equal(shouldSuggestWrap(SIM_TURN_CAP - 3), true);
  assert.equal(shouldSuggestWrap(SIM_TURN_CAP), true);
});

test("턴캡 강제 디브리핑 — cap 도달 시 true, 단 위기 판은 억제(안전>원가 §5)", () => {
  assert.equal(simForceDebrief({ dollTurns: SIM_TURN_CAP - 1, hasSensitive: false }), false);
  assert.equal(simForceDebrief({ dollTurns: SIM_TURN_CAP, hasSensitive: false }), true);
  assert.equal(simForceDebrief({ dollTurns: SIM_TURN_CAP + 3, hasSensitive: true }), false);
});

test("보낼 말 [SEND:] 마커 추출 + 화면 스트립", () => {
  const raw = "오늘 연습 잘했어.\n[SEND:요즘 어떻게 지내? 문득 생각나서 연락했어.]";
  assert.equal(extractSendLine(raw), "요즘 어떻게 지내? 문득 생각나서 연락했어.");
  assert.equal(stripSimMarkers(raw), "오늘 연습 잘했어.");
  assert.equal(extractSendLine("마커 없음"), null);
});

test("대화 컨텍스트 블록 — 유저/인형 라벨", () => {
  const block = buildSimContextBlock([
    { role: "user", content: "안녕" },
    { role: "assistant", content: "어 왜" },
  ]);
  assert.equal(block, "유저: 안녕\n인형: 어 왜");
});

test("인형 프로필 포맷 — 있는 필드만, 없으면 빈 문자열", () => {
  assert.equal(formatPartnerForDoll({ statusLabel: "썸 타는 중", mbti: "INTP", personality: "말수 적음" }),
    "관계: 썸 타는 중\nMBTI: INTP\n한 줄 성격: 말수 적음");
  assert.equal(formatPartnerForDoll({ statusLabel: "연애 중", mbti: null, personality: null }), "관계: 연애 중");
});

test("personality append — 빈 기존값이면 불릿으로 시작", () => {
  assert.equal(appendPersonalityNote(null, "사실 낯을 많이 가려"), "· 사실 낯을 많이 가려");
  assert.equal(appendPersonalityNote("", "낯가림"), "· 낯가림");
  assert.equal(appendPersonalityNote("   ", "낯가림"), "· 낯가림");
});

test("personality append — 기존값 있으면 개행+불릿으로 누적", () => {
  assert.equal(appendPersonalityNote("무뚝뚝함", "사실 다정해"), "무뚝뚝함\n· 사실 다정해");
});

test("personality append — 노트 앞뒤 공백 정리", () => {
  assert.equal(appendPersonalityNote("A", "  낯가림  "), "A\n· 낯가림");
});
