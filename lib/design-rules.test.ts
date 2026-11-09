// 계약: 디자인 공통 규칙(글자·모서리·그림자·글자색·버튼·카드·장식·이모지)이 다시 흩어지지 않게 잠근다.
// 값의 정본은 app/globals.css 의 @theme·@utility 한 곳. 스펙 docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md
// 예외: 파일 전체는 ALLOW 목록(이유와 함께), 줄 하나는 그 줄이나 바로 윗줄에 `design-allow: <이유>` 주석.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offenders } from "./design-scan";

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

