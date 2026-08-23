import { test } from "node:test";
import assert from "node:assert/strict";
import { routeLabel } from "./route-labels.ts";
import { FORTUNE_CONFIG } from "../fortune/types.ts";

test("주요 여정 라우트에 한글 라벨이 붙는다", () => {
  assert.match(routeLabel("/"), /홈/);
  assert.match(routeLabel("/concern"), /고민 입력/);
  assert.match(routeLabel("/tarot/draw"), /카드 뽑기/);
  assert.match(routeLabel("/tarot/reading"), /상담 대화/);
  assert.match(routeLabel("/shop"), /충전소/);
  assert.match(routeLabel("/relationship"), /연애 상담/);
});

test("운세 상품 라벨은 FORTUNE_CONFIG 에서 끌어온다 (하드코딩 아님)", () => {
  // href 가 실제 경로와 1:1 이므로 config 라벨이 그대로 나와야 한다
  assert.equal(routeLabel("/fortune/compat"), `별콩 운세 — ${FORTUNE_CONFIG.compat.label}`);
  assert.equal(
    routeLabel("/fortune/compat-social"),
    `별콩 운세 — ${FORTUNE_CONFIG.compat_social.label}`
  );
  assert.equal(routeLabel("/fortune/daily"), `별콩 운세 — ${FORTUNE_CONFIG.daily.label}`);
  assert.equal(
    routeLabel("/fortune/tarot/tarot_love"),
    `별콩 운세 — ${FORTUNE_CONFIG.tarot_love.label}`
  );
  assert.equal(routeLabel("/fortune/good_days"), `별콩 운세 — ${FORTUNE_CONFIG.good_days.label}`);
});

test("FORTUNE_CONFIG 의 모든 href 가 라벨로 해석된다", () => {
  for (const c of Object.values(FORTUNE_CONFIG)) {
    if (typeof c.href !== "string") continue;
    const label = routeLabel(c.href);
    assert.notEqual(label, c.href, `${c.href} 가 path 그대로 떨어졌다 — 역매핑 누락`);
  }
});

test("비콘이 접은 :id 세그먼트도 매핑된다", () => {
  assert.match(routeLabel("/mypage/support/:id"), /문의 상세/);
});

test("어드민 경로는 어드민으로 묶인다", () => {
  assert.equal(routeLabel("/admin"), "어드민 — 대시보드");
  assert.match(routeLabel("/admin/traffic"), /^어드민 — /);
});

test("매핑에 없는 경로는 path 그대로 (조용히 틀리지 않는다)", () => {
  assert.equal(routeLabel("/not-a-real-route"), "/not-a-real-route");
  assert.equal(routeLabel("/fortune/unknown_product"), "/fortune/unknown_product");
});

test("라벨은 빈 문자열이 되지 않는다", () => {
  for (const p of ["/", "/concern", "/admin", "/fortune", "/zzz"]) {
    assert.ok(routeLabel(p).length > 0, `${p} 라벨이 비었다`);
  }
});

test("byeoljari 라우트에 라벨이 붙는다", () => {
  assert.match(routeLabel("/fortune/byeoljari"), /별자리/);
  assert.match(routeLabel("/fortune/byeoljari/:shareId"), /별자리/);
  assert.notEqual(routeLabel("/fortune/byeoljari"), "/fortune/byeoljari");
});
