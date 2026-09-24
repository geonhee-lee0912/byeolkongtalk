import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_NAME, DAY_LINE, dayMarks, MARK_CHIP } from "./day-label.ts";
import type { DayFactors } from "./day-score.ts";
import { tenGod, type TenGod } from "@/lib/saju/pairing";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { buildCalendar } from "./calendar.ts";

const ALL: TenGod[] = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"];

test("DAY_NAME — 십신 10종 전부에 하루 이름이 있고 서로 다르다", () => {
  const names = ALL.map((t) => DAY_NAME[t]);
  assert.equal(names.length, 10);
  for (const n of names) assert.ok(n.length > 0, "빈 이름");
  assert.equal(new Set(names).size, 10, "이름이 중복됐다");
});

test("DAY_LINE — 십신 10종 전부에 한 줄이 있고 반말로 끝난다", () => {
  for (const t of ALL) {
    const line = DAY_LINE[t];
    assert.ok(line.length >= 20, `${t} 한 줄이 너무 짧다`);
    // 별콩이는 해체 반말만 쓴다. 허용 어미를 열거하면(옛 방식) 카피가 바뀔 때마다 정규식을
    // 손봐야 하므로, 금지 어미(존댓말 ~요 / 문어체 ~다)만 막는다.
    assert.ok(!/[다요]\.?$/.test(line.trim()), `${t} 한 줄이 반말 종결이 아니다: ${line}`);
  }
});

// M-4 — day-label.ts JSDoc 이 "46~53자·2문장"을 규율로 못 박아뒀는데 그걸 지키는 테스트가
// 없었다. 실측(현재 10종 전부 46~53자·정확히 2문장)에 맞춰 상한·문장 수를 단언한다 — 문구가
// 아니라 규율이 깨지는 걸 잡는 게 목적이라 상한값은 실측 그대로 쓴다(문구는 안 건드림).
test("DAY_LINE — 길이 46~53자·정확히 2문장(히어로 카드 3줄 밀림 방지, day-label.ts JSDoc 규율)", () => {
  for (const t of ALL) {
    const line = DAY_LINE[t];
    assert.ok(line.length >= 46 && line.length <= 53, `${t} 길이가 46~53자를 벗어났다: ${line.length}자 "${line}"`);
    const sentences = (line.match(/\./g) ?? []).length;
    assert.equal(sentences, 2, `${t} 문장 수가 2가 아니다(${sentences}): "${line}"`);
  }
});

const base: DayFactors = {
  relation: "비화",
  heavenlyCombo: false,
  sixCombo: false,
  clash: false,
  scarcity: "balanced",
};

test("dayMarks — 아무 신호도 없으면 빈 배열", () => {
  assert.deepEqual(dayMarks(base), []);
});

test("dayMarks — 천간합·육합이 같이 있으면 둘 다, 순서는 천간합 먼저", () => {
  const m = dayMarks({ ...base, heavenlyCombo: true, sixCombo: true });
  assert.deepEqual(m.map((x) => x.glyph), ["✧", "◇"]);
  assert.deepEqual(m.map((x) => x.label), ["설렘", "척척"]);
});

test("dayMarks — 충은 △", () => {
  assert.deepEqual(dayMarks({ ...base, clash: true }), [{ glyph: "△", label: "삐걱", strength: "full" }]);
});

test("dayMarks — 그 오행이 아예 없으면 ＋(빈 곳 채움), 부족/보통/과다는 마크 없음", () => {
  assert.deepEqual(dayMarks({ ...base, scarcity: "absent" }), [{ glyph: "＋", label: "채움", strength: "full" }]);
  for (const s of ["scarce", "balanced", "excess"] as const) {
    assert.deepEqual(dayMarks({ ...base, scarcity: s }), []);
  }
});

test("dayMarks — 네 신호가 다 있으면 고정 순서로 넷 다", () => {
  const m = dayMarks({ ...base, heavenlyCombo: true, sixCombo: true, clash: true, scarcity: "absent" });
  assert.deepEqual(m.map((x) => x.glyph), ["✧", "◇", "△", "＋"]);
});

test("마크 라벨은 전부 2글자 — 셀 하단 띠가 한 줄에 들어가야 한다", () => {
  const all = [
    dayMarks({ relation: "비화", heavenlyCombo: true, sixCombo: true, clash: false, scarcity: "absent" }),
    dayMarks({ relation: "비화", heavenlyCombo: false, sixCombo: false, clash: true, scarcity: "balanced" }),
  ].flat();
  assert.ok(all.length >= 4, "네 종류가 다 나와야 한다");
  for (const m of all) assert.equal(m.label.length, 2, `${m.glyph} 라벨이 2글자가 아니다: ${m.label}`);
});

test("나 탭 마크는 전부 full — 강도 2단은 우리 탭에서만 쓴다", () => {
  // 🔴 한 신호만 켜면 배열이 1개라 "전부"를 못 잰다 — 네 신호를 다 켜서 글리프 4종을 전부 훑는다.
  const ms = dayMarks({ relation: "비화", heavenlyCombo: true, sixCombo: true, clash: true, scarcity: "absent" });
  assert.equal(ms.length, 4, "네 종류가 다 나와야 이 단정이 '전부'를 보장한다");
  for (const m of ms) assert.equal(m.strength, "full", `${m.glyph} 가 full 이 아니다`);
});

test("MARK_CHIP — 네 글리프가 전부 있고 설렘만 어두운 글자다", () => {
  for (const g of ["✧", "◇", "△", "＋"] as const) {
    assert.ok(MARK_CHIP[g].bg.startsWith("#"), g);
    assert.ok(MARK_CHIP[g].fg.startsWith("#"), g);
  }
  assert.equal(MARK_CHIP["✧"].fg, "#412402");
  for (const g of ["◇", "△", "＋"] as const) assert.equal(MARK_CHIP[g].fg, "#ffffff");
});

function cal30() {
  // gender 는 SajuInput 필수 필드(계산엔 무관, input.gender 로만 echo) — 계획 원문엔 없었으나
  // 누락 시 tsc --noEmit 가 실패해 이 저장소 전 호출부 관례(gender: "other")를 따라 채운다.
  const saju = calcSaju({ year: 1994, month: 5, day: 17, hour: 14, gender: "other", isLunar: false });
  const temporal = calcTemporalLuck(baseDateForKst("2026-09-12"), 1994, { includeMonth: true });
  // calcTemporalLuck 의 dailyLuck 는 옵셔널이라 지역 변수로 좁혀야 tsc --noEmit 가 통과한다
  // (assert.ok 는 TS 를 좁혀주지 않는다).
  const daily = temporal.dailyLuck;
  if (!daily || daily.length < 30) throw new Error("dailyLuck 30일이 필요하다");
  return { saju, cells: buildCalendar(saju, daily, "2026-09-12") };
}

test("buildCalendar — 모든 셀에 tenGod·marks 가 채워진다", () => {
  const { cells } = cal30();
  for (const c of cells) {
    assert.ok(c.tenGod, `${c.date} tenGod 없음`);
    assert.ok(Array.isArray(c.marks), `${c.date} marks 가 배열이 아님`);
  }
});

test("buildCalendar — 30일이면 십신 10종이 정확히 3일씩 (일진 천간 10일 주기)", () => {
  const { cells } = cal30();
  const count: Record<string, number> = {};
  for (const c of cells.slice(0, 30)) count[c.tenGod] = (count[c.tenGod] ?? 0) + 1;
  assert.equal(Object.keys(count).length, 10, "십신이 10종 다 나오지 않았다");
  for (const [tg, n] of Object.entries(count)) assert.equal(n, 3, `${tg} 가 ${n}일`);
});

test("buildCalendar — tenGod 인자 순서 고정(내 일간 기준으로 그날 천간을 본다)", () => {
  // 🔴 분포 테스트로는 못 잡는다 — 인자를 뒤집으면 십신 10종이 '치환'될 뿐 분포는 그대로다
  //    (생아↔아생, 극아↔아극 맞교환). 호출부 방향을 여기서 직접 고정한다.
  const { saju, cells } = cal30();
  for (const c of cells) {
    assert.equal(c.tenGod, tenGod(saju.dayStem, c.ganji[0]), `${c.date} 십신 방향이 뒤집혔다`);
  }
});

test("buildCalendar — 등급·점수는 무회귀(십신 추가가 판정을 바꾸지 않는다)", () => {
  // ⚠️ 이 테스트가 깨지면 day-score.ts 의 dayGrade() 임계값(70/45)이 바뀐 것은 아닌지 먼저 볼 것.
  const { cells } = cal30();
  // day-score.ts 를 안 건드렸으므로 임계 그대로: 70↑ good, 45↑ normal, 나머지 caution
  for (const c of cells) {
    const expected = c.score >= 70 ? "good" : c.score >= 45 ? "normal" : "caution";
    assert.equal(c.grade.tone, expected, `${c.date} 등급이 점수와 어긋남`);
  }
});

// 🔴 이 테스트는 어휘를 잠그는 게 목적이 아니라 **선정 기준**을 잠근다 — 상대를 요구하는 말
//    (끌림·결속 같은)이 다시 들어오면 1인칭 달력에서 목적어가 빈다.
test("dayMarks — 라벨은 전부 2글자이고 상대를 요구하는 옛 어휘가 아니다", () => {
  const m = dayMarks({ ...base, heavenlyCombo: true, sixCombo: true, clash: true, scarcity: "absent" });
  for (const x of m) assert.equal(x.label.length, 2, x.label);
  const banned = ["끌림", "결속"];
  for (const x of m) assert.ok(!banned.includes(x.label), `상대를 요구하는 어휘: ${x.label}`);
});
