// 디자인 다듬기 변환표 — 이 브랜치 전용(옮기기가 끝나면 폴더째 지운다). 표의 정본은 스펙 §2.2~2.5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTextSize } from "./map";

const to = (c: string) => {
  const r = mapTextSize(c);
  return "to" in r ? r.to : `manual:${r.manual}`;
};

test("글자 크기 — 작은 값은 11 로 모인다", () => {
  for (const c of ["text-[8px]", "text-[9px]", "text-[9.5px]", "text-[10px]", "text-[10.5px]", "text-[11px]"]) assert.equal(to(c), "text-11", c);
});

test("글자 크기 — 0.5px 는 위 단계로", () => {
  assert.equal(to("text-[11.5px]"), "text-12");
  assert.equal(to("text-[12px]"), "text-12");
  assert.equal(to("text-xs"), "text-12");
  assert.equal(to("text-[12.5px]"), "text-13");
  assert.equal(to("text-[13px]"), "text-13");
  assert.equal(to("text-[13.5px]"), "text-14");
  assert.equal(to("text-[14px]"), "text-14");
  assert.equal(to("text-sm"), "text-14");
  assert.equal(to("text-[14.5px]"), "text-15");
  assert.equal(to("text-[15px]"), "text-15");
});

test("글자 크기 — 큰 값", () => {
  assert.equal(to("text-[17px]"), "text-17");
  for (const c of ["text-[19px]", "text-[20px]", "text-xl"]) assert.equal(to(c), "text-20", c);
  for (const c of ["text-[21px]", "text-[22px]", "text-[24px]", "text-2xl"]) assert.equal(to(c), "text-22", c);
  for (const c of ["text-[26px]", "text-[28px]", "text-[30px]"]) assert.equal(to(c), "text-28", c);
  assert.equal(to("text-[44px]"), "text-44");
  assert.equal(to("text-[52px]"), "text-52");
});

test("글자 크기 — 역할로 정할 값은 사람이 본다", () => {
  for (const c of ["text-[16px]", "text-[18px]", "text-base", "text-lg", "text-3xl", "text-4xl"]) assert.match(to(c), /^manual:/, c);
});

test("글자 크기 — 접두사는 남긴다", () => {
  assert.equal(to("sm:text-[13px]"), "sm:text-13");
  assert.equal(to("group-hover:text-xs"), "group-hover:text-12");
});

test("글자 크기 — 글자 크기가 아닌 text-* 는 건드리지 않는다", () => {
  for (const c of ["text-eye-purple", "text-center", "text-white/70", "text-[#4F4A5E]", "text-balance"]) assert.equal(to(c), c, c);
});

import { mapRadius, mapShadow, mapTextColor } from "./map";
const r = (c: string) => { const x = mapRadius(c); return "to" in x ? x.to : `manual:${x.manual}`; };
const s = (c: string) => { const x = mapShadow(c); return "to" in x ? x.to : `manual:${x.manual}`; };

test("모서리 — 8 로 모이는 값", () => {
  for (const c of ["rounded-md", "rounded-[9px]", "rounded-[4px]", "rounded"]) assert.equal(r(c), "rounded-lg", c);
});
test("모서리 — 16 으로 모이는 값", () => {
  for (const c of ["rounded-[18px]", "rounded-[20px]", "rounded-[22px]"]) assert.equal(r(c), "rounded-2xl", c);
});
test("모서리 — 말풍선 꼬리는 4", () => {
  assert.equal(r("rounded-tl-md"), "rounded-tl-sm");
  assert.equal(r("rounded-br-md"), "rounded-br-sm");
  assert.equal(r("rounded-bl-md"), "rounded-bl-sm");
  assert.equal(r("rounded-tr-md"), "rounded-tr-sm");
});
test("모서리 — 그 밖", () => {
  assert.equal(r("rounded-[50%]"), "rounded-full");
  for (const c of ["rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-full", "rounded-t-3xl", "rounded-lg", "sm:rounded-3xl"]) assert.equal(r(c), c, c);
});

test("그림자 — 바닥 카드로", () => {
  for (const c of [
    "shadow-sm", "shadow",
    "shadow-[0_2px_10px_rgba(159,138,208,0.07)]", "shadow-[0_2px_10px_rgba(159,138,208,0.08)]",
    "shadow-[0_8px_30px_rgba(40,30,70,0.08)]", "shadow-[0_8px_30px_rgba(40,30,70,0.10)]",
    "shadow-[0_1px_4px_rgba(90,62,140,0.05)]",
  ]) assert.equal(s(c), "shadow-card", c);
});
test("그림자 — 위로 뜬 막대·창", () => {
  assert.equal(s("shadow-[0_-4px_24px_rgba(31,23,53,0.18)]"), "shadow-float-up");
  assert.equal(s("shadow-[0_8px_32px_rgba(31,23,53,0.25)]"), "shadow-modal");
  assert.equal(s("shadow-[0_8px_32px_rgba(31,23,53,0.28)]"), "shadow-modal");
});
test("그림자 — 사람이 볼 값", () => {
  for (const c of ["shadow-md", "shadow-lg", "shadow-[0_4px_18px_rgba(232,194,106,0.25)]", "shadow-[0_0_0_3px_rgba(159,138,208,0.18)]", "shadow-lilac", "shadow-lilac-deep/30"]) assert.match(s(c), /^manual:/, c);
  for (const c of ["shadow-card", "shadow-none", "shadow-modal"]) assert.equal(s(c), c, c);
});

const col = (c: string, dark = false) => { const x = mapTextColor(c, dark); return "to" in x ? x.to : `manual:${x.manual}`; };
test("글자색 — 투명 보조 글자는 보조 한 색으로", () => {
  for (const n of [40, 50, 60, 70, 80, 85, 90, 95]) assert.equal(col(`text-text-light/${n}`), "text-text-light");
  assert.equal(col("placeholder:text-text-light/60"), "placeholder:text-text-faint");
});
test("글자색 — 밝은 바탕 연보라 글자는 강조 보라로, 밤 바탕은 그대로", () => {
  assert.equal(col("text-lilac-deep"), "text-accent");
  assert.equal(col("text-lilac-deep/70"), "text-accent");
  assert.equal(col("hover:text-lilac-deep"), "hover:text-accent");
  assert.equal(col("text-lilac-deep", true), "text-accent-on-dark");
  assert.equal(col("text-lilac-deep/80", true), "text-accent-on-dark");
  for (const c of ["border-lilac-deep", "bg-lilac-deep", "fill-lilac-deep", "text-eye-purple"]) assert.equal(col(c), c, c);
});

import { isOnDark } from "./map";
test("밤 바탕 파일의 lilac 글자는 변환 대상에서 빠진다", () => {
  const light = ['<div className="card">', '  <span className="text-lilac-deep">연애</span>', "</div>"].join("\n");
  const dark = ['<div className="bg-night rounded-2xl p-4">', "  <p>", '    <span className="text-lilac-deep">연애</span>', "  </p>", "</div>"].join("\n");
  assert.equal(isOnDark(light, 1), false);
  assert.equal(isOnDark(dark, 2), true);
  assert.equal(isOnDark('<span className="bg-night-card text-lilac-deep">x</span>', 0), true);
});

test("객체 기본 속성 이름은 건드리지 않는다", () => {
  for (const c of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    assert.equal(to(c), c, c);
    assert.equal(r(c), c, c);
    assert.equal(s(c), c, c);
    assert.equal(col(c), c, c);
  }
});
