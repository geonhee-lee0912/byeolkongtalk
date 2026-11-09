// 계약: 디자인 공통 규칙(글자·모서리·그림자·글자색·버튼·카드·장식·이모지)이 다시 흩어지지 않게 잠근다.
// 값의 정본은 app/globals.css 의 @theme·@utility 한 곳. 스펙 docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md
// 예외: 파일 전체는 ALLOW 목록(이유와 함께), 줄 하나는 그 줄이나 바로 윗줄에 `design-allow: <이유>` 주석.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classBlocks, offenders } from "./design-scan";

const css = () => readFileSync("app/globals.css", "utf8");

test("토큰 값이 스펙과 같다", () => {
  const c = css();
  const want: Record<string, string> = {
    "--text-11": "0.6875rem", "--text-11--line-height": "1rem",
    "--text-12": "0.75rem", "--text-12--line-height": "1.125rem",
    "--text-13": "0.8125rem", "--text-13--line-height": "1.25rem",
    "--text-14": "0.875rem", "--text-14--line-height": "1.3125rem",
    "--text-15": "0.9375rem", "--text-15--line-height": "1.375rem",
    "--text-16": "1rem", "--text-16--line-height": "1.625rem",
    "--text-17": "1.0625rem", "--text-17--line-height": "1.5rem",
    "--text-20": "1.25rem", "--text-20--line-height": "1.75rem",
    "--text-22": "1.375rem", "--text-22--line-height": "1.875rem",
    "--text-28": "1.75rem", "--text-28--line-height": "2.25rem",
    "--text-44": "2.75rem", "--text-44--line-height": "1",
    "--text-52": "3.25rem", "--text-52--line-height": "1",
    "--color-text-light": "#726398",
    "--color-accent": "#775CB0",
    "--color-accent-on-dark": "#9F8AD0",
    "--color-text-faint": "#978AB3",
    "--color-inner": "#FBF8FE",
    "--color-gold-wash": "#FBF1D6",
    "--shadow-card": "0 1px 4px rgba(90, 62, 140, 0.08)",
    "--shadow-float": "0 4px 16px rgba(40, 30, 70, 0.12)",
    "--shadow-float-up": "0 -4px 16px rgba(40, 30, 70, 0.12)",
    "--shadow-modal": "0 8px 32px rgba(31, 23, 53, 0.25)",
  };
  for (const [k, v] of Object.entries(want)) {
    const m = c.match(new RegExp(`${k.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`));
    assert.equal(m?.[1].trim(), v, k);
  }
});

test("루트 글자 크기가 16px 로 고정이다", () => {
  assert.match(css(), /\bhtml\s*\{[^}]*font-size:\s*16px/);
});

test("입력칸 16 규칙이 레이어 밖에 있다", () => {
  const c = css();
  const i = c.indexOf("@media (pointer: coarse)");
  assert.ok(i >= 0, "pointer: coarse 규칙 없음");
  assert.match(c.slice(i, i + 200), /input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/);
  const before = c.slice(0, i);
  const opens = (before.match(/@layer[^{;]*\{/g) ?? []).length;
  assert.equal(opens, 0, "입력칸 규칙이 @layer 안에 있으면 text-* 유틸리티에 진다");
});

test("부품 클래스가 있다", () => {
  const c = css();
  for (const u of ["btn", "btn-primary", "btn-secondary", "btn-text", "btn-lg", "btn-md", "btn-sm", "card", "card-report", "card-inner", "card-night", "bg-night-card"]) {
    assert.match(c, new RegExp(`@utility ${u}\\s*\\{`), u);
  }
});

test("조립식 임의값 클래스가 없다", () => {
  assert.deepEqual(offenders(/(text|rounded|shadow)-\[\$\{/), []);
});

// ── 글자 크기 10단계(스펙 §2.2) — text-11·12·13·14·15·16·17·20·22·28 + 큰 숫자 44·52 만
test("임의 px 글자 크기가 없다", () => {
  assert.deepEqual(offenders(/\btext-\[\d+(\.\d+)?px\]/), []);
});
test("Tailwind 기본 글자 크기를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)\b/), []);
});


// ── 모서리 4단계(스펙 §2.3) — rounded-lg 8 · xl 12 · 2xl 16 · 3xl 24 · full, 말풍선 꼬리만 -sm
test("임의 모서리 값이 없다", () => {
  assert.deepEqual(offenders(/\brounded(-[a-z]{1,2})?-\[/), []);
});
test("rounded-md 와 맨 rounded 를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/\brounded(-(t|b|l|r|tl|tr|bl|br))?-md\b|(?<![\w-])rounded(?=[\s"'`])/), []);
});


// ── 그림자 3단계(스펙 §2.4) — shadow-card · shadow-float(-up) · shadow-modal 만
// drop-shadow-* 는 그림·아이콘에 거는 필터라 이 규칙 밖(상자 그림자만 본다)
test("임의·기본 그림자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<!drop-)\bshadow-(\[|sm\b|md\b|lg\b|xl\b|2xl\b)|(?<![\w-])shadow(?=[\s"'`])/), []);
});
test("그림자 색 접미사가 없다", () => {
  assert.deepEqual(offenders(/\bshadow-(lilac|night|lilac-deep|gold|gold-soft|eye-purple)(\/\d+)?\b/), []);
});


// ── 글자색 4개(스펙 §2.5) — 투명도 글자 없음, 밝은 바탕 연보라 글자는 accent, 밤 바탕은 accent-on-dark
test("투명도 글자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/\btext-text-light\/\d+/), []);
});
test("밝은 바탕에서 연보라 글자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<![\w-])text-lilac-deep\b/), []);
});

// ── 버튼 종류 3 × 크기 3(스펙 §2.6) — btn + btn-primary|secondary|text + btn-lg|md|sm
const BUTTONS = () => classBlocks(["button", "Link", "a"]);
const at = (b: { file: string; line: number }) => `${b.file}:${b.line}`;
test("버튼 바탕에 진보라·흰 글자 조합을 쓰지 않는다(주 버튼은 btn-primary, 선택 상태는 bg-accent)", () => {
  const solid = /(?<![\w:-])bg-(lilac-deep|eye-purple)(?![\w/-])[^"'`]*\btext-white\b|\btext-white\b[^"'`]*(?<![\w:-])bg-(lilac-deep|eye-purple)(?![\w/-])/;
  assert.deepEqual(BUTTONS().filter((b) => solid.test(b.cls)).map(at), []);
});
// 금색 구독·별 버튼, 회사 규정(카카오·애플), 위험(탈퇴·삭제), 목록 줄은 제외
const NOT_PART = /FEE500|bg-black|rose-|bg-gold\b|text-left|design-allow/;
test("큰 버튼은 부품 클래스를 쓴다", () => {
  const big = BUTTONS().filter((b) => /\bw-full\b/.test(b.cls) && /\bpy-(3|3\.5|4)\b/.test(b.cls) && /\bfont-bold\b/.test(b.cls) && !/\bbtn\b/.test(b.cls) && !NOT_PART.test(b.cls));
  assert.deepEqual(big.map(at), []);
});
test("카카오·애플 버튼은 규정 색을 유지한다", () => {
  const kakao = BUTTONS().filter((b) => /FEE500/.test(b.cls));
  assert.ok(kakao.length >= 8, `카카오 버튼이 사라졌다: ${kakao.length}`);
  assert.deepEqual(kakao.filter((b) => /\bbtn-(primary|secondary|text)\b/.test(b.cls)).map(at), []);
  assert.match(readFileSync("components/auth/AppleLoginButton.tsx", "utf8"), /bg-black/);
});

// ── 카드 3종(스펙 §2.7) — card(바닥, 그림자만) · card-inner(안쪽 칸, 테두리+아주 옅은 바탕) · card-night
test("반투명 흰 카드가 없다", () => {
  assert.deepEqual(offenders(/(?<![\w:-])bg-white\/(70|75|80|85|90|95)\b/), []);
});
test("카드는 테두리와 그림자를 같이 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?=.*\bshadow-card\b)(?=.*(?<![\w:-])border(?![\w-]*-(0|t|b|l|r|x|y)\b)(\s|-lilac|-gold|-cream|-white|"))/), []);
});
// 입력칸(input·textarea)은 카드가 아니라 이 규칙 밖. 말풍선(꼬리 -sm)·창 판(max-w-)·입력칸 모양 선택 상자(Dropdown)도 제외
test("크림 바탕 둥근 칸을 카드로 쓰지 않는다(card · card-inner 로)", () => {
  const blocks = classBlocks(["div", "section", "article", "li", "a", "Link", "button", "p"]).filter(
    (b) =>
      /(?<![\w:-])bg-cream-warm(?![\w/-])/.test(b.cls) &&
      /\brounded-(xl|2xl)\b/.test(b.cls) &&
      !/rounded-(tl|tr|bl|br)-sm|max-w-/.test(b.cls) &&
      b.file !== "components/common/Dropdown.tsx" &&
      b.file !== "components/safety/SafetyBanner.tsx", // 위기 안내 — 톤을 지키려고 바탕·테두리 그대로
  );
  assert.deepEqual(blocks.map(at), []);
});

// ── 장식 정리(스펙 §2.8) — 그라데이션·빛·움직임은 장면과 기능에만
const SCENE_FILES = [
  "components/relationship/sim/", // 연애 시뮬 무대 조명·밤 배경
  "app/relationship/sim/page.tsx", // 시뮬 화면 밤 배경
  "components/common/EmphasisText.tsx", // 형광펜 밑줄
  "components/fortune/landing/FortuneSamplePreview.tsx", // 글 끝 흐림
  "components/fortune/FortuneGeneratingScreen.tsx", // 진행 막대
  "components/byeolmaru/CardReportView.tsx", // 줄무늬 게이지
  "components/relationship/DollAvatar.tsx", // 아바타 색
  "components/tarot/CardDrawRitual.tsx", // 카드 뽑기 의식
  "app/global-error.tsx", // 전면 오류 화면 밤하늘
  "lib/heroGradients.ts", // 히어로 배너 밤하늘 장면
];
test("카드·배너·버튼·타일에 그라데이션이 없다", () => {
  assert.deepEqual(offenders(/linear-gradient|radial-gradient|bg-gradient-to-/, SCENE_FILES), []);
});
test("반짝·둥둥 움직임이 없다", () => {
  // 움직임은 로딩·카드 뽑기·시뮬 무대에만
  assert.deepEqual(offenders(/animate-(star-twinkle|float)\b/, ["components/fortune/FortuneGeneratingScreen.tsx", "components/tarot/CardDrawRitual.tsx", "components/relationship/sim/"]), []);
});
test("배경 빛 덩어리가 없다", () => {
  assert.deepEqual(offenders(/(?<![\w-])blur-3xl\b/), []);
});
test("시트·창 뒤 막은 하나다", () => {
  assert.deepEqual(offenders(/backdropClassName=(?!"bg-night\/50 backdrop-blur-sm")/), []);
  assert.match(readFileSync("components/common/Dialog.tsx", "utf8"), /backdropClassName = "bg-night\/50 backdrop-blur-sm"/);
});
test("별콩이 후광은 한 값이다(bg-gold/30 blur-lg)", () => {
  assert.deepEqual(offenders(/bg-gold\/(25|40)\b[^"]*\bblur-|\bblur-(xl|2xl)\b[^"]*bg-gold|bg-gold\/\d+[^"]*\bblur-(xl|2xl)\b/), []);
});
