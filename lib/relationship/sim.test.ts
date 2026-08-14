// lib/relationship/sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simForceDebrief, extractSendLine, stripSimMarkers,
  buildSimContextBlock, formatPartnerForDoll, appendPersonalityNote, extractSuggestions,
  resolveFunding, extractPortraitObservations, dedupPortraitNotes, simFreeBadge,
} from "./sim.ts";
import { SIM_TURN_CAP } from "./types.ts";

test("시뮬 무료 배지 — funding 별 라벨", () => {
  assert.equal(simFreeBadge({ funding: "runway", cost: 0, runwayRemaining: 2 }), "무료 2판 남음");
  assert.equal(simFreeBadge({ funding: "hook", cost: 0, runwayRemaining: 0 }), "이번 주 무료 판");
  assert.equal(simFreeBadge({ funding: "paid", cost: 15, runwayRemaining: 0 }), "판당 15별");
  assert.equal(simFreeBadge(null), null);
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

test("답변 추천 [SAY]/[WHY] 쌍 추출 — 최대 3개, 공백 정리", () => {
  const raw = "추천이야\n[SAY:요즘 어떻게 지내?][WHY: 가볍게 문 여는 방향 ]\n[SAY: 솔직히 보고 싶었어 ][WHY:마음을 직접 여는 방향]\n[SAY:요새 뭐 해?][WHY:상대 근황부터 묻는 방향]";
  assert.deepEqual(extractSuggestions(raw), [
    { say: "요즘 어떻게 지내?", why: "가볍게 문 여는 방향" },
    { say: "솔직히 보고 싶었어", why: "마음을 직접 여는 방향" },
    { say: "요새 뭐 해?", why: "상대 근황부터 묻는 방향" },
  ]);
});

test("답변 추천 추출 — 3개 초과는 앞 3개만, WHY 없으면 빈 이유, 마커 없으면 빈 배열", () => {
  assert.deepEqual(extractSuggestions("[SAY:1][WHY:a][SAY:2][WHY:b][SAY:3][WHY:c][SAY:4][WHY:d]"),
    [{ say: "1", why: "a" }, { say: "2", why: "b" }, { say: "3", why: "c" }]);
  assert.deepEqual(extractSuggestions("[SAY:안녕]"), [{ say: "안녕", why: "" }]);
  assert.deepEqual(extractSuggestions("마커 없는 텍스트"), []);
});

test("런웨이 소진 전엔 무조건 runway", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  assert.equal(resolveFunding({ runwayUsed: 0, hookLastAt: null, now }), "runway");
  assert.equal(resolveFunding({ runwayUsed: 2, hookLastAt: null, now }), "runway");
});

test("런웨이 소진 후 훅 이력 없으면 hook", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  assert.equal(resolveFunding({ runwayUsed: 3, hookLastAt: null, now }), "hook");
});

test("훅은 7일 롤링 — 6일 전이면 paid, 7일 전이면 hook", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const sixDays = new Date("2026-08-08T00:00:00Z").toISOString();  // 6일 전
  const sevenDays = new Date("2026-08-07T00:00:00Z").toISOString(); // 7일 전
  assert.equal(resolveFunding({ runwayUsed: 3, hookLastAt: sixDays, now }), "paid");
  assert.equal(resolveFunding({ runwayUsed: 5, hookLastAt: sevenDays, now }), "hook");
});

test("초상화 마커 최대 2개 추출 + 공백 정리", () => {
  const raw = "통찰...\n[PORTRAIT:표현이 서툴지만 관심 있으면 질문이 많아진다]\n[PORTRAIT:갈등 상황에선 먼저 거리를 둔다]\n[SEND:요즘 어때?]";
  assert.deepEqual(extractPortraitObservations(raw), [
    "표현이 서툴지만 관심 있으면 질문이 많아진다",
    "갈등 상황에선 먼저 거리를 둔다",
  ]);
});

test("초상화 마커 3개 이상이면 앞 2개만", () => {
  const raw = "[PORTRAIT:a][PORTRAIT:b][PORTRAIT:c]";
  assert.deepEqual(extractPortraitObservations(raw), ["a", "b"]);
});

test("stripSimMarkers 는 SEND·PORTRAIT 둘 다 제거", () => {
  const raw = "본문\n[PORTRAIT:x]\n[SEND:y]";
  assert.equal(stripSimMarkers(raw), "본문");
});

test("dedup — 기존과 근접 중복인 후보는 버린다", () => {
  const existing = "· 표현이 서툴지만 관심 있으면 질문이 많아진다";
  assert.deepEqual(
    dedupPortraitNotes(existing, ["표현이 서툴지만 관심 있으면 질문이 많아진다", "새 관찰"]),
    ["새 관찰"]
  );
});
