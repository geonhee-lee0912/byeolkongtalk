import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 배선 계약(소스 검사) — 앱 안 상점·충전 시트는 토스를 부르지 않고 스토어 결제(브리지)로 산다. 스펙 2026-11-23-앱-결제 §5.
 * 🔴 앱 안에서 토스 결제창·웹 결제 안내가 보이면 애플 3.1.1(외부 결제 유도) 심사 거절. 타입·빌드·유닛으로는 못 잡아서 소스로 잠근다.
 * 규칙: useTossPayment 는 components/shop/TossPaymentBridge.tsx(그림 없는 컴포넌트) 안에서만 부르고, 화면은 그 브리지를
 * channel === "toss"(브라우저)일 때만 그린다(훅은 조건부로 못 부르니 컴포넌트째 안 그린다). 토스를 말하는 글은 web-only(앱에서 CSS 로 숨김) 줄에만.
 */
const SCREENS = ["app/shop/page.tsx", "components/upsell/RechargeSheet.tsx"];
const BRIDGE = "components/shop/TossPaymentBridge.tsx";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** 주석을 지운다(설명 주석의 '토스' 는 화면에 안 나온다) — 줄 수는 유지 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("TossPaymentBridge — useTossPayment 를 부르고 아무것도 그리지 않는다", () => {
  const src = stripComments(read(BRIDGE));
  assert.equal([...src.matchAll(/useTossPayment\(/g)].length, 1);
  assert.match(src, /return null;/);
});

for (const file of SCREENS) {
  const src = stripComments(read(file));

  test(`${file} — 화면은 useTossPayment 를 직접 부르지 않는다`, () => {
    assert.doesNotMatch(src, /useTossPayment\(/);
  });

  test(`${file} — TossPaymentBridge 는 channel === "toss" 일 때만 그린다`, () => {
    const all = [...src.matchAll(/<TossPaymentBridge\b/g)].length;
    const guarded = [...src.matchAll(/channel === "toss" &&\s*\(?\s*<TossPaymentBridge\b/g)].length;
    assert.ok(all >= 1, "TossPaymentBridge 를 그리는 곳이 있다");
    assert.equal(guarded, all, "TossPaymentBridge 를 그리는 모든 곳이 channel === \"toss\" 조건 아래");
  });

  test(`${file} — 앱 경로는 useStorePurchase 로 산다`, () => {
    assert.match(src, /useStorePurchase\(/);
    assert.match(src, /\bbuy\(/);
  });

  test(`${file} — 토스·웹 결제를 말하는 글은 web-only 줄에만`, () => {
    src.split("\n").forEach((line, i) => {
      // 화면 글은 한국어다 — 영문 toss 는 코드 식별자(tossError·channel === "toss"·<TossX)라 보지 않는다
      if (/토스/.test(line)) assert.match(line, /web-only/, `${file}:${i + 1} ${line.trim()}`);
      assert.doesNotMatch(line, /웹에서|홈페이지|브라우저에서/, `${file}:${i + 1}`);
    });
  });
}

// 시트는 읽기 화면에 늘 붙어 있다(open 만 바뀐다) — 토스 준비(로그인 확인·SDK)를 시트가 열리기 전에 끝내 두던 브라우저 동작을 지킨다
test("RechargeSheet — 닫혀 있어도 브라우저면 토스 브리지는 붙어 있다", () => {
  const src = stripComments(read("components/upsell/RechargeSheet.tsx"));
  assert.match(src, /const tossBridge = store\.channel === "toss" && <TossPaymentBridge\b/);
  assert.match(src, /if \(!open \|\| typeof document === "undefined"\) return <>\{tossBridge\}<\/>;/);
});

// 앱 결제 성공도 토스 성공과 같이 — 원클릭 재개(pending_upsell)를 남기고 돌아갈 자리로 새로 연다(화면들이 잔액·재개 배너를 다시 읽는다)
test("RechargeSheet — 스토어 성공은 pending_upsell 저장 + returnTo 로 새로 연다(토스와 같은 함수)", () => {
  const src = stripComments(read("components/upsell/RechargeSheet.tsx"));
  const body = (name: string) => {
    const start = src.indexOf(`async function ${name}(`);
    assert.ok(start >= 0, name);
    return src.slice(start, src.indexOf("\n  }\n", start));
  };
  const store = body("handleStoreCharge");
  assert.match(store, /savePendingUpsell\(pendingUpsell\)/);
  assert.match(store, /window\.location\.replace\(/);
  assert.match(body("handleCharge"), /savePendingUpsell\(pendingUpsell\)/);
  assert.equal([...src.matchAll(/sessionStorage\.setItem\(/g)].length, 1, "pending_upsell 저장은 한 곳(savePendingUpsell)");
});

// 상점 완료 화면(finishCharge)과 같이 — 앱 결제 성공은 돌아가기 전에 진동(앱 caps ui). 토스는 상점 완료 화면이 진동한다
test("RechargeSheet — 스토어 성공은 돌아가기 전에 appHaptic(\"success\")", () => {
  const src = stripComments(read("components/upsell/RechargeSheet.tsx"));
  const start = src.indexOf("async function handleStoreCharge(");
  const body = src.slice(start, src.indexOf("\n  }\n", start));
  const haptic = body.indexOf('appHaptic("success")');
  assert.ok(haptic >= 0, "성공 진동이 있다");
  assert.ok(haptic < body.indexOf("window.location.replace("), "진동이 화면을 바꾸기 전");
});

// 시트는 읽기 화면에 늘 붙어 있어 마운트 때 한 번만 물으면, 못 받은 뒤 '다시 열어줘' 가 거짓말이 된다 — 열 때마다 다시 묻는다(못 받았을 때만, 겹치지 않게)
test("RechargeSheet — 열릴 때 스토어 가격을 다시 묻는다(useStorePurchase.retryPrices)", () => {
  const src = stripComments(read("components/upsell/RechargeSheet.tsx"));
  const start = src.indexOf("useEffect(() => {\n    if (!open) {");
  assert.ok(start >= 0, "열림 effect");
  const effect = src.slice(start, src.indexOf("}, [open]);", start));
  assert.match(effect, /store\.retryPrices\(\)/);
  const hook = stripComments(read("components/shop/useStorePurchase.ts"));
  assert.match(hook, /needsPriceAsk\(/, "다시 묻기는 needsPriceAsk 로 거른다(묻는 중·받음·앱 밖이면 안 묻는다)");
});

// 운영자 11-28: 한국만 서비스하니 앱 상점 카드도 웹처럼 '별당 N원 · N% 알뜰' 을 보인다(앱 스토어 가격도 웹과 같은 원화 — 11-28 TestFlight 결제창 ₩1,000 확인).
// 원래 스펙 §2 는 스토어 가격 단계가 다를 수 있어 앱에서 숨겼다 — 해외 판매를 열면 다시 볼 것
test("상점 — 카드 아랫줄은 앱·웹 같은 줄(스토어 경로라고 숨기지 않는다)", () => {
  const src = stripComments(read("app/shop/page.tsx"));
  assert.match(src, /packageSubLine\(pkg, !!showBonus\)/);
  assert.doesNotMatch(src, /storePrice/);
  // 시트 칸엔 원화 계산 줄이 없다(별 수·보너스·남는 별만) — 가격은 priceText 하나
  const sheet = stripComments(read("components/upsell/RechargeSheet.tsx"));
  assert.doesNotMatch(sheet, /packageSubLine|별당/);
});
