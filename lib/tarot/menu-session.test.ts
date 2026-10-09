import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTION_OPTIONS, PENDING_KEY } from "../emotions.ts";
import { TAROT_SPREAD_KEY } from "./session.ts";
import { getPositionLabels } from "./spreads.ts";
import { getMenu, getDeepProduct, productPositions } from "./menu.ts";
import {
  CONTINUATION_KEY,
  menuSelection,
  saveMenuSelection,
  saveDeepContinuation,
  spendConsent,
} from "./menu-session.ts";

function fakeStore() {
  const m = new Map<string, string>();
  return { m, setItem: (k: string, v: string) => void m.set(k, v) };
}

test("menuSelection — 상품 스프레드·태그 카테고리·고민 + 가격 동의", () => {
  const deep = getDeepProduct("진로·방향이 고민이야")!;
  assert.deepEqual(menuSelection(deep, "이직 고민"), {
    spreadType: "stay_or_go_6",
    spreadCategory: "career",
    emotion: "진로·방향이 고민이야",
    concern: "이직 고민",
    consented: true,
  });
});

test("saveMenuSelection — 카드 뽑기가 읽는 키 하나만 쓴다", () => {
  const s = fakeStore();
  saveMenuSelection(s, getMenu("재회할 수 있을까")[0], "다시 연락해도 될까");
  assert.deepEqual([...s.m.keys()], [TAROT_SPREAD_KEY]);
  assert.equal(JSON.parse(s.m.get(TAROT_SPREAD_KEY)!).spreadType, "one_card");
});

test("saveDeepContinuation — 이어가기(fresh)·고민·깊게 선택(동의) 3키", () => {
  const s = fakeStore();
  const deep = getDeepProduct("걔 속마음이 궁금해")!;
  saveDeepContinuation(s, { parentReadingId: "r-1", deep, concern: "걔가 왜 답장을 늦게 할까" });
  assert.deepEqual(JSON.parse(s.m.get(CONTINUATION_KEY)!), { previousReadingId: "r-1", mode: "fresh" });
  assert.deepEqual(JSON.parse(s.m.get(PENDING_KEY)!), {
    emotion: "걔 속마음이 궁금해",
    concern: "걔가 왜 답장을 늦게 할까",
    type: "tarot",
  });
  const sel = JSON.parse(s.m.get(TAROT_SPREAD_KEY)!);
  assert.equal(sel.spreadType, "deep_feelings_5");
  assert.equal(sel.consented, true);
});

test("CONTINUATION_KEY — 대화 화면·이어가기 모달·추천 이동과 같은 키", () => {
  assert.equal(CONTINUATION_KEY, "byeolkong:continuation");
});

test("spendConsent — 동의는 한 판에 한 번: 같은 선택을 consented:false 로 다시 저장", () => {
  const s = fakeStore();
  const sel = menuSelection(getDeepProduct("재회할 수 있을까")!, "다시 볼 수 있을까");
  spendConsent(s, sel);
  const saved = JSON.parse(s.m.get(TAROT_SPREAD_KEY)!);
  assert.equal(saved.consented, false);
  assert.equal(saved.spreadType, "reunion_5");
  assert.equal(saved.concern, "다시 볼 수 있을까");
});

test("광고한 자리 = 뽑는 자리 — 메뉴 32개 전부, 카드 뽑기와 같은 호출 모양(Task 6 리뷰)", () => {
  for (const tag of EMOTION_OPTIONS.map((o) => o.tag)) {
    for (const p of getMenu(tag)) {
      const sel = menuSelection(p, "고민");
      // app/tarot/draw/page.tsx 가 선택값으로 자리를 만드는 모양 그대로
      assert.deepEqual(getPositionLabels(sel.spreadType, sel.spreadCategory, sel.emotion), productPositions(p), p.key);
    }
  }
});
