import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// 타로 입구 = 옛 흐름(먼저 로그인) 고정 — 입구 반반 판정(2026-11-07) 뒤 새 흐름(로그인 전 맛보기) 코드를 걷어냈다.
// 화면 코드라 유닛으로 못 돌리는 배선을 소스로 지킨다. 주석 속 언급은 배선이 아니니 뺀다.

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const root = (rel: string) => new URL(`../../${rel}`, import.meta.url);
const sourceOf = (rel: string) => stripComments(readFileSync(root(rel), "utf8"));

test("홈 — 비로그인이 고민 태그를 누르면 바로 /login(돌아오면 /concern), 회원은 /concern", () => {
  const code = sourceOf("app/page.tsx");
  const handler = code.match(/const handleSelect = \(tag: EmotionTag\) => \{([\s\S]*?)\n  \};/);
  assert.ok(handler, "홈의 handleSelect 를 못 찾았다 — 이름이 바뀌었으면 이 계약도 같이 고칠 것");
  const body = handler[1];
  assert.match(body, /localStorage\.getItem\("byeolkong_user"\)/, "로그인 판정은 localStorage 의 byeolkong_user 다");
  assert.match(
    body,
    /if \(flow === "old"\) \{\s*router\.push\(`\/login\?next=\$\{encodeURIComponent\("\/concern"\)\}`\);\s*return;\s*\}\s*router\.push\("\/concern"\);/,
    "비로그인은 /login?next=/concern 으로 가고 끝나야 한다 — 로그인 없이 고민 쓰기로 보내면 안 된다"
  );
  assert.match(body, /const flow: "member" \| "old" = user \? "member" : "old";/, "비로그인은 늘 옛 흐름이다");
});

test("뽑기 화면 — 확인 팝업 → 충전 시트, 충전 뒤엔 /tarot/draw 로 돌아온다", () => {
  const code = sourceOf("app/tarot/draw/page.tsx");
  assert.match(code, /<StarConfirmModal/, "카드를 다 뽑으면 확인 팝업(잔액 부족 노출 = paywall_shown)이 떠야 한다");
  assert.match(code, /returnTo="\/tarot\/draw"/, "충전 시트의 복귀 주소는 /tarot/draw 다");
  assert.match(code, /onCharge=\{\(\) => setRechargeSheetOpen\(true\)\}/, "충전 버튼은 충전 시트만 연다");
});

test("로그인 실패 리다이렉트 호출부 4곳은 목적지(next)를 넘기지 않는다 — 실패는 늘 홈(lib/auth-redirect.ts)", () => {
  const callers = [
    "app/api/auth/kakao/route.ts",
    "app/api/auth/login/apple/route.ts",
    "app/api/auth/apple/complete/route.ts",
    "app/api/auth/app/handoff/route.ts",
  ];
  for (const f of callers) {
    const calls = [...sourceOf(f).matchAll(/loginFailRedirectUrl\(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, `${f}: loginFailRedirectUrl 호출을 못 찾았다`);
    for (const args of calls) assert.doesNotMatch(args, /\bnext\b/, `${f}: 실패 목적지에 next 를 넘긴다 — ${args}`);
  }
});

test("AuthBootstrap 의 주소 정리 예외는 /start 하나 — 뽑기 화면 예외(새 흐름 자동 이어가기용)는 없다", () => {
  const boot = sourceOf("components/auth/AuthBootstrap.tsx");
  assert.doesNotMatch(boot, /["']\/tarot\/draw["']/);
  assert.match(boot, /if \(pathname === "\/start"\) return;/);
});

test("새 흐름 장치가 남아 있지 않다", () => {
  for (const f of [
    "lib/tarot/entry-ab.ts",
    "lib/tarot/guest-price.ts",
    "lib/tarot/menu-ab.ts",
    "components/tarot/CardReveal.tsx",
    "components/tarot/LoginSheet.tsx",
  ]) {
    assert.equal(existsSync(root(f)), false, `${f} 가 다시 생겼다`);
  }
  const files = [
    "app/page.tsx",
    "app/concern/page.tsx",
    "app/tarot/page.tsx",
    "app/tarot/draw/page.tsx",
    "components/tarot/SpreadPicker.tsx",
    "app/api/stars/balance/route.ts",
    "lib/wallet.ts",
  ];
  const leftovers = /entryArm|entry-ab|ENTRY_FLOW|isNewFlowGuest|LoginSheet|CardReveal|guest-price|savePendingDraw|loadPendingDraw|resume=/;
  for (const f of files) {
    const m = sourceOf(f).match(leftovers);
    assert.equal(m, null, `${f} 에 새 흐름 흔적이 있다: ${m?.[0]}`);
  }
});
