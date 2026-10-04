import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLARIFIER_MARKER,
  isClarifierCandidate,
  shouldKeepOpen,
  repairClarifierMarker,
  createEndMarkerFilter,
} from "./inchat-offer.ts";

const base = {
  assistantTurnsSoFar: 2,
  wrapMode: "free" as const,
  crisisActive: false,
  forceEnd: false,
  clarifierCount: 0,
  pastAssistantTexts: ["첫 풀이", "두번째 답"],
  userAsking: true,
};

test("isClarifierCandidate — 기본 조건 충족이면 true", () => {
  assert.equal(isClarifierCandidate(base), true);
});

test("isClarifierCandidate — 첫 풀이 턴·정리 구간·위기·마무리 버튼·구매 이력·기제안·질문 아님이면 false", () => {
  assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 0 }), false);
  assert.equal(isClarifierCandidate({ ...base, wrapMode: "converge" }), false);
  assert.equal(isClarifierCandidate({ ...base, wrapMode: "hardcap" }), false);
  assert.equal(isClarifierCandidate({ ...base, crisisActive: true }), false);
  assert.equal(isClarifierCandidate({ ...base, forceEnd: true }), false);
  assert.equal(isClarifierCandidate({ ...base, clarifierCount: 1 }), false);
  assert.equal(
    isClarifierCandidate({ ...base, pastAssistantTexts: ["답", `제안\n${CLARIFIER_MARKER}`] }),
    false,
  );
  assert.equal(isClarifierCandidate({ ...base, userAsking: false }), false);
});

test("isClarifierCandidate — 첫 풀이 직후(assistantTurnsSoFar=1)부터 후보다(경계 ≥1)", () => {
  assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 1, pastAssistantTexts: ["첫 풀이"] }), true);
});

test("isClarifierCandidate — 기제안 마커가 이력의 처음·중간·마지막 어디에 있어도 후보에서 뺀다", () => {
  const offered = `제안\n${CLARIFIER_MARKER}`;
  for (const pastAssistantTexts of [
    [offered, "다음 답", "또 다음 답"],
    ["첫 풀이", offered, "또 다음 답"],
    ["첫 풀이", "다음 답", offered],
  ]) {
    assert.equal(isClarifierCandidate({ ...base, assistantTurnsSoFar: 3, pastAssistantTexts }), false);
  }
});

test("shouldKeepOpen — 자연 마무리선 + 묻는 중이면 true, 강제 종료·위기·질문 아님·다른 구간이면 false", () => {
  const k = { wrapMode: "hardcap" as const, mustEnd: false, crisisActive: false, userAsking: true };
  assert.equal(shouldKeepOpen(k), true);
  assert.equal(shouldKeepOpen({ ...k, mustEnd: true }), false);
  assert.equal(shouldKeepOpen({ ...k, crisisActive: true }), false);
  assert.equal(shouldKeepOpen({ ...k, userAsking: false }), false);
  assert.equal(shouldKeepOpen({ ...k, wrapMode: "converge" }), false);
});

test("repairClarifierMarker — 제안 문구가 있고 마커가 없으면 끝에 붙인다(앞부분은 그대로)", () => {
  const text = "답이야.\n\n이 부분은 카드 한 장 더 펼쳐 보면 더 또렷해져. 지금 얘기 계속해도 되고";
  const out = repairClarifierMarker(text);
  assert.equal(out, `${text}\n${CLARIFIER_MARKER}`);
  assert.ok(out.startsWith(text));
});

test("repairClarifierMarker — 문구 없음·이미 마커 있음이면 그대로", () => {
  assert.equal(repairClarifierMarker("그냥 답이야."), "그냥 답이야.");
  const withMarker = `한 장 더 볼 수 있어\n${CLARIFIER_MARKER}`;
  assert.equal(repairClarifierMarker(withMarker), withMarker);
});

test("repairClarifierMarker — '카드 한 장' 만 있는 마무리 인사·평범한 문장엔 마커를 붙이지 않는다", () => {
  for (const text of [
    "그 마음, 카드 한 장으로 다 풀리진 않지만 오늘은 여기까지 함께 짚어왔어.",
    "지금 카드 한 장의 결은 '내일 확실히 연락'보다는 먼저 서로의 입장을 생각하는 단계야.",
  ]) {
    assert.equal(repairClarifierMarker(text), text);
  }
});

test("repairClarifierMarker — '한 장을 더'·'한장 더' 변형 제안에도 마커를 붙인다", () => {
  for (const text of [
    "이 부분은 카드 한 장을 더 펼쳐 보면 훨씬 또렷해질 수 있어.",
    "한장 더 펼쳐서 볼 수도 있어.",
  ]) {
    assert.equal(repairClarifierMarker(text), `${text}\n${CLARIFIER_MARKER}`);
  }
});

test("마커 판정은 클라(parseAllRecoMarkers)처럼 대소문자를 무시한다 — 기제안 이력·마커 수리 모두", () => {
  for (const variant of ["[RECO:Tarot:Clarifier]", "[reco:tarot:clarifier]"]) {
    // 클라는 이 마커로도 칩을 띄우므로 '대화당 1회' 에 센다
    assert.equal(isClarifierCandidate({ ...base, pastAssistantTexts: ["답", `제안\n${variant}`] }), false);
    // 이미 마커가 있는 응답엔(제안 문구가 있어도) 또 붙이지 않는다
    const text = `한 장 더 볼 수 있어\n${variant}`;
    assert.equal(repairClarifierMarker(text), text);
  }
  // 대조: 다른 칩(extend)의 마커는 '한 장 더' 로 세지 않는다
  assert.equal(isClarifierCandidate({ ...base, pastAssistantTexts: ["답", "더 얘기하기\n[RECO:extend]"] }), true);
});

test("createEndMarkerFilter — 청크 경계에 걸친 [END] 도 지운다", () => {
  const f = createEndMarkerFilter();
  const out = f.push("답이야.\n\n[EN") + f.push("D]") + f.flush();
  assert.equal(out, "답이야.\n\n");
});

test("createEndMarkerFilter — [END] 가 아닌 '[' 는 보존한다", () => {
  const f = createEndMarkerFilter();
  const out = f.push("카드 [CARD:1] 와 [") + f.push("보조]") + f.flush();
  assert.equal(out, "카드 [CARD:1] 와 [보조]");
});

test("createEndMarkerFilter — 한 청크 안의 [END] 를 지운다", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("끝[END]") + f.flush(), "끝");
});

test("createEndMarkerFilter — push 는 붙잡을 꼬리만 남기고 바로 내보낸다(flush 까지 모았다 내보내지 않는다)", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("평범한 문장이야."), "평범한 문장이야."); // "[" 없는 텍스트는 즉시
  assert.equal(f.push("답이야.\n\n[EN"), "답이야.\n\n"); // "[EN" 만 붙잡는다
  assert.equal(f.push("D]"), ""); // 마커가 완성되면 통째로 사라진다
  assert.equal(f.push("카드 [CARD:1] 와 ["), "카드 [CARD:1] 와 "); // 완성된 [CARD:1] 은 바로, 끝의 "[" 만 붙잡는다
  assert.equal(f.push("보조]"), "[보조]"); // [END] 가 아니므로 붙잡았던 "[" 와 함께 나온다
  assert.equal(f.flush(), "");
});

/** s 를 가능한 모든 청크 분할(2^(n-1)가지)로 필터에 흘린 결과들 — 청크 경계가 어디든 결과가 같아야 한다 */
function filterEveryChunking(s: string): string[] {
  // 비트마스크(1 << n)는 32자부터 넘쳐 반복이 0번 돌고 — 단언 없이 통과해 버린다. 짧은 문자열만 받고, 분할을 전부 돌렸는지 확인한다
  assert.ok(s.length >= 1 && s.length <= 20, `전수 분할 검사는 1~20자만 다룬다(받은 길이 ${s.length})`);
  const outs: string[] = [];
  for (let mask = 0; mask < 1 << (s.length - 1); mask++) {
    const f = createEndMarkerFilter();
    let out = "";
    let from = 0;
    for (let i = 1; i <= s.length; i++) {
      if (i === s.length || mask & (1 << (i - 1))) {
        out += f.push(s.slice(from, i));
        from = i;
      }
    }
    outs.push(out + f.flush());
  }
  assert.equal(outs.length, 2 ** (s.length - 1)); // 모든 분할을 실제로 돌렸다
  return outs;
}

test("createEndMarkerFilter — 청크를 어디서 끊어도 결과가 같다(모든 분할)", () => {
  for (const out of filterEveryChunking("답이야.\n[END]끝")) assert.equal(out, "답이야.\n끝");
});

test("createEndMarkerFilter — 지운 자리에서 새로 맞붙은 [END] 도 지운다(한 청크·모든 분할)", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("[E[END]ND]") + f.flush(), "");
  for (const out of filterEveryChunking("[E[END]ND]")) assert.equal(out, "");
  for (const out of filterEveryChunking("a[[END]END]b")) assert.equal(out, "ab");
});

test("createEndMarkerFilter — 스트림이 [END] 앞부분에서 끝나면 flush 가 그대로 내보낸다", () => {
  const f = createEndMarkerFilter();
  assert.equal(f.push("끝 [EN") + f.flush(), "끝 [EN");
});
