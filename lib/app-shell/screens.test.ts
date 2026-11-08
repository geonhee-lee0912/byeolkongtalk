import { test } from "node:test";
import assert from "node:assert/strict";
import { appScreen, depthOnChange, nextDepth } from "./screens.ts";

test("탭 첫 화면 5개", () => {
  assert.deepEqual(appScreen("/"), { kind: "tab", title: "타로톡" });
  assert.deepEqual(appScreen("/fortune"), { kind: "tab", title: "사주 운세" });
  assert.deepEqual(appScreen("/byeolmaru"), { kind: "tab", title: "별마루" });
  assert.deepEqual(appScreen("/shop"), { kind: "tab", title: "별콩 상점" });
  assert.deepEqual(appScreen("/mypage"), { kind: "tab", title: "마이" });
});

test("끝 슬래시가 붙어도 같은 화면", () => {
  assert.deepEqual(appScreen("/mypage/"), { kind: "tab", title: "마이" });
  assert.deepEqual(appScreen("/tarot/result/"), { kind: "sub", title: "타로 결과", tabRoot: "/" });
});

const SUBS: [string, string, string][] = [
  ["/tarot/result", "타로 결과", "/"],
  ["/saju/result", "사주 결과", "/"],
  ["/saju/reading", "사주 풀이", "/"],
  ["/tarot/reading", "타로 풀이", "/"],
  ["/tarot/draw", "타로 카드 뽑기", "/"],
  ["/concern", "고민 적기", "/"],
  ["/saju/concern", "사주 고민 적기", "/"],
  ["/fortune/result", "운세 리포트", "/fortune"],
  ["/fortune/saju-mbti", "사주 MBTI", "/fortune"],
  ["/fortune/byeoljari/abc", "인연 별자리", "/fortune"],
  ["/fortune/compat", "궁합", "/fortune"],
  ["/fortune/daily", "오늘의 운세", "/fortune"],
  ["/fortune/아무거나", "사주 운세", "/fortune"],
  ["/byeolmaru/day", "그날의 흐름", "/byeolmaru"],
  ["/byeolmaru/saju", "오늘 사주", "/byeolmaru"],
  ["/byeolmaru/tarot", "오늘 타로", "/byeolmaru"],
  ["/byeolmaru/woori", "우리 사이", "/byeolmaru"],
  ["/mypage/notifications", "알림 설정", "/mypage"],
  ["/mypage/payments", "결제·별 내역", "/mypage"],
  ["/mypage/support", "고객센터", "/mypage"],
  ["/mypage/support/new", "문의 남기기", "/mypage"],
  ["/mypage/support/123", "문의 내용", "/mypage"],
  ["/mypage/legal", "약관·사업자 정보", "/mypage"],
  ["/readings", "보관함", "/mypage"],
  ["/terms", "이용약관", "/mypage"],
  ["/privacy", "개인정보처리방침", "/mypage"],
  ["/refund", "환불정책", "/mypage"],
  ["/relationship", "연애 상담", "/"],
  ["/how-to-use", "별콩이 사용 방법", "/"],
  ["/guide", "타로 가이드", "/"],
  ["/guide/tarot-cards/the-fool", "타로 가이드", "/"],
  ["/free/daily-card", "오늘의 카드", "/"],
  ["/survey", "별콩이의 질문", "/"],
  ["/select", "별콩톡", "/"],
  ["/saju", "별콩톡", "/"],
  ["/tarot", "별콩톡", "/"],
  ["/모르는-경로", "별콩톡", "/"],
];

for (const [path, title, tabRoot] of SUBS) {
  test(`하위 화면 ${path} → ${title}`, () => {
    assert.deepEqual(appScreen(path), { kind: "sub", title, tabRoot });
  });
}

test("접두사는 경로 조각 단위로만 맞는다 (/termsx 는 이용약관이 아니다)", () => {
  assert.deepEqual(appScreen("/termsx"), { kind: "sub", title: "별콩톡", tabRoot: "/" });
});

test("nextDepth — push 는 하나 늘고 pop 은 0 아래로 안 내려간다", () => {
  assert.equal(nextDepth(0, "pop"), 0);
  assert.equal(nextDepth(2, "push"), 3);
  assert.equal(nextDepth(3, "pop"), 2);
});

test("depthOnChange — 쿼리만 바뀐 이동도 한 칸으로 센다(Codex PR #21 P2: 별마루 지난 날짜 → 오늘 카드)", () => {
  assert.equal(depthOnChange(0, "/byeolmaru/day?tab=tarot&date=2026-11-01", "/byeolmaru/day?tab=tarot", false), 1);
  assert.equal(depthOnChange(1, "/byeolmaru/day?tab=tarot", "/byeolmaru/day?tab=tarot&date=2026-11-01", true), 0);
});

test("depthOnChange — 첫 화면(이전 없음)·같은 주소는 그대로", () => {
  assert.equal(depthOnChange(0, null, "/mypage/payments", false), 0);
  assert.equal(depthOnChange(2, "/mypage?x=1", "/mypage?x=1", false), 2);
});

test("광고 수신거부 화면 — 하위 화면, 마이 탭", () => {
  assert.deepEqual(appScreen("/push/unsubscribe"), { kind: "sub", title: "광고 수신거부", tabRoot: "/mypage" });
});
