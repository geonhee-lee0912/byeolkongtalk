import { test } from "node:test";
import assert from "node:assert/strict";
import { glyphCellsToIcon, stripDecor } from "./emoji";

test("기호 하나만 든 칸은 아이콘으로", () => {
  assert.equal(glyphCellsToIcon(`<span className="x">✕</span>`).code, `<span className="x"><Icon name="close" size={16} /></span>`);
  assert.equal(glyphCellsToIcon(`<span>›</span>`).code, `<span><Icon name="chev_r" size={16} /></span>`);
  assert.equal(glyphCellsToIcon(`<b>⭐</b>`).count, 1);
  assert.equal(glyphCellsToIcon(`<span>🦄</span>`).count, 0);
});
test("문장·라벨 속 장식은 지운다", () => {
  assert.equal(stripDecor(`title: "🌱 타고난 기질",`), `title: "타고난 기질",`);
  assert.equal(stripDecor(`<p>해 볼까요 ✨</p>`), `<p>해 볼까요</p>`);
  assert.equal(stripDecor(`label: "결과 보기 →"`), `label: "결과 보기"`);
  assert.equal(stripDecor(`<span>💬 물어보기</span>`), `<span>물어보기</span>`);
});
test("이모지와 상관없는 공백은 건드리지 않는다", () => {
  assert.equal(stripDecor(`<Icon name="star" size={14} /> {x ? " · 현재 잔액 " : ""} 🌙`), `<Icon name="star" size={14} /> {x ? " · 현재 잔액 " : ""}`);
  assert.equal(stripDecor(`.join("  ·  ") + "💬"`), `.join("  ·  ") + ""`);
});
test("날짜 기호·괄호 속 화살표 문장은 그대로", () => {
  assert.equal(stripDecor(`glyph: "◇"`), `glyph: "◇"`);
  assert.equal(stripDecor(`"A → B 로 바뀐다"`), `"A → B 로 바뀐다"`);
});
