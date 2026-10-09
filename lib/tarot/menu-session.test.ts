import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { EMOTION_OPTIONS, PENDING_KEY } from "../emotions.ts";
import {
  CONCERN_REWRITE_HREF,
  CONTINUATION_KEY,
  TAROT_SPREAD_KEY,
  isConcernRewrite,
} from "./session.ts";
import { getPositionLabels } from "./spreads.ts";
import { getMenu, getDeepProduct, productPositions } from "./menu.ts";
import {
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

test("saveDeepContinuation — 고민·깊게 선택(동의)·이어가기(fresh) 3키, 이어가기 표시는 마지막에 쓴다", () => {
  const s = fakeStore();
  const deep = getDeepProduct("걔 속마음이 궁금해")!;
  const concern = "걔가 왜 답장을 늦게 할까";
  saveDeepContinuation(s, { parentReadingId: "r-1", deep, concern });
  // Map 은 삽입 순서를 지킨다 — 표시가 마지막이어야 앞 쓰기가 던질 때 부모 연결만 남아 다음 새 리딩에 붙지 않는다
  assert.deepEqual([...s.m.keys()], [PENDING_KEY, TAROT_SPREAD_KEY, CONTINUATION_KEY]);
  assert.deepEqual(JSON.parse(s.m.get(PENDING_KEY)!), {
    emotion: "걔 속마음이 궁금해",
    concern,
    type: "tarot",
  });
  const sel = JSON.parse(s.m.get(TAROT_SPREAD_KEY)!);
  assert.deepEqual(sel, menuSelection(deep, concern));
  assert.equal(sel.spreadType, "deep_feelings_5");
  assert.deepEqual(JSON.parse(s.m.get(CONTINUATION_KEY)!), { previousReadingId: "r-1", mode: "fresh" });
});

test("CONTINUATION_KEY — 대화 화면·이어가기 모달·추천 이동과 같은 키", () => {
  assert.equal(CONTINUATION_KEY, "byeolkong:continuation");
});

test("isConcernRewrite — '고민 다시 적기' 주소(?rewrite=1)로 들어온 것만 true", () => {
  assert.equal(isConcernRewrite(new URL(CONCERN_REWRITE_HREF, "https://x").search), true);
  assert.equal(isConcernRewrite(""), false);
  assert.equal(isConcernRewrite("?rewrite=0"), false);
  assert.equal(isConcernRewrite("?a=1&rewrite=1"), true);
});

test("spendConsent — 동의는 한 판에 한 번: 같은 선택을 consented:false 로 다시 저장하고 그 값을 돌려준다", () => {
  const s = fakeStore();
  const sel = menuSelection(getDeepProduct("재회할 수 있을까")!, "다시 볼 수 있을까");
  const spent = spendConsent(s, sel);
  assert.deepEqual(spent, { ...sel, consented: false });
  const saved = JSON.parse(s.m.get(TAROT_SPREAD_KEY)!);
  assert.deepEqual(saved, spent);
  assert.equal(saved.spreadType, "reunion_5");
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

// 계약 — 가격 동의(consented: true)를 만드는 곳은 menu-session.ts 하나다.
// 옛 그룹(prod) 흐름에 동의가 새면 카드 뽑기의 확인 팝업이 조용히 사라져 반반 비교가 오염된다.
// 메뉴판 그룹 화면은 menuSelection·saveMenuSelection·saveDeepContinuation 만 불러 동의를 심는다.
const ROOT = join(import.meta.dirname, "..", "..");

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
}

test("consented: true 를 만드는 곳은 lib/tarot/menu-session.ts 하나", () => {
  const files: string[] = [];
  for (const d of ["app", "components", "lib"]) walk(join(ROOT, d), files);
  const offenders = files
    .filter((f) => /consented\s*:\s*true/.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .sort();
  assert.deepEqual(
    offenders,
    ["lib/tarot/menu-session.ts"],
    `동의(consented: true)는 menu-session.ts 에서만 만든다 — 옛 그룹 흐름에 새면 확인 팝업이 조용히 사라진다:\n  ${offenders.join("\n  ")}`
  );
});
