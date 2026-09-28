import { test } from "node:test";
import assert from "node:assert/strict";
import { pivotLong, ZERO_CELL } from "./byeolmaru-pivot";

// dev 실측 모양 그대로(admin_byeolmaru_engagement 2026-09-27): 키별 사람이 3·3·3 인데
// 전체는 3명이다 — 앱에서 더하면 9명이 된다. 이 파일이 지키는 게 바로 그 차이다.
const DAY_TAB = [
  { group: "day_tab", key: "*", events: 68, actors: 3 },
  { group: "day_tab", key: "saju", events: 19, actors: 3 },
  { group: "day_tab", key: "tarot", events: 27, actors: 3 },
  { group: "day_tab", key: "woori", events: 22, actors: 3 },
];

test("전체('*')는 키별 합이 아니라 DB 가 다시 센 값이다", () => {
  const p = pivotLong(DAY_TAB);
  assert.deepEqual(p.total("day_tab"), { events: 68, actors: 3 });
  // 키별 사람을 더하면 9 — 전체 3 과 다르다. 이 단언이 깨지는 날은 누군가 합산으로 바꾼 날이다.
  const summed = p.breakdown("day_tab").reduce((a, r) => a + r.cell.actors, 0);
  assert.equal(summed, 9);
  assert.notEqual(summed, p.total("day_tab").actors);
});

test("breakdown 은 '*' 를 빼고 건수 내림차순", () => {
  const p = pivotLong(DAY_TAB);
  assert.deepEqual(
    p.breakdown("day_tab").map((r) => r.key),
    ["tarot", "woori", "saju"]
  );
});

test("동수면 키 사전순으로 고정한다 — 렌더가 호출마다 흔들리지 않게", () => {
  const p = pivotLong([
    { group: "g", key: "b", events: 5, actors: 1 },
    { group: "g", key: "a", events: 5, actors: 1 },
  ]);
  assert.deepEqual(p.breakdown("g").map((r) => r.key), ["a", "b"]);
});

test("PostgREST 가 문자열로 준 BIGINT 를 경계에서 숫자로 바꾼다", () => {
  // 🔴 타입은 number 라고 적혀 있지만 런타임에는 문자열이 온다 — tsc 가 못 잡는 클래스다.
  //    문자열이 그대로 흐르면 정렬이 사전순이 되어 "9" 가 "78" 보다 앞선다.
  const p = pivotLong([
    { group: "g", key: "*", events: "241", actors: "2" },
    { group: "g", key: "big", events: "78", actors: "2" },
    { group: "g", key: "small", events: "9", actors: "1" },
  ]);
  assert.deepEqual(p.total("g"), { events: 241, actors: 2 });
  assert.equal(typeof p.total("g").events, "number");
  assert.deepEqual(p.breakdown("g").map((r) => r.key), ["big", "small"]);
});

test("없는 그룹·'*' 없는 그룹은 ZERO — undefined 를 돌려주지 않는다", () => {
  // 창 안에 한 번도 안 찍힌 이벤트는 RPC 가 행 자체를 안 준다. 그걸 빈칸으로 그리면
  // "0 회" 와 "지표가 없다" 가 화면에서 같아진다.
  const p = pivotLong([{ group: "g", key: "only", events: 1, actors: 1 }]);
  assert.deepEqual(p.total("없는그룹"), ZERO_CELL);
  assert.deepEqual(p.total("g"), ZERO_CELL);
  assert.deepEqual(p.breakdown("없는그룹"), []);
});
