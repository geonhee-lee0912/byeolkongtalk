import { test } from "node:test";
import assert from "node:assert/strict";
import { daeunTheme } from "./daeun-theme.ts";

// 일간 갑(목) 기준 — 십신 5버킷이 모두 나오도록 대운 천간을 고른다.
test("daeunTheme: 갑 일간 대운 천간별 5개 국면 테마", () => {
  assert.equal(daeunTheme("갑", "갑")?.key, "비겁"); // 비견
  assert.equal(daeunTheme("갑", "병")?.key, "식상"); // 식신(목생화)
  assert.equal(daeunTheme("갑", "무")?.key, "재성"); // 편재(목극토)
  assert.equal(daeunTheme("갑", "경")?.key, "관성"); // 편관(금극목)
  assert.equal(daeunTheme("갑", "임")?.key, "인성"); // 편인(수생목)
});

test("daeunTheme: label·desc·emoji 를 갖춘다", () => {
  const t = daeunTheme("갑", "무");
  assert.equal(t?.label, "결실을 거두는 때");
  assert.equal(t?.emoji, "🌾");
  assert.equal(typeof t?.desc, "string");
  assert.ok((t?.desc.length ?? 0) > 5);
});

test("daeunTheme: 편/정(음양)은 같은 오행관계 → 같은 국면", () => {
  // 을(목) 기준: 무(편재)·기(정재) 둘 다 재성 국면
  assert.equal(daeunTheme("을", "무")?.key, "재성");
  assert.equal(daeunTheme("을", "기")?.key, "재성");
});

test("daeunTheme: 알 수 없는 천간은 null (legacy·비정상 방어)", () => {
  assert.equal(daeunTheme("갑", "XX"), null);
  assert.equal(daeunTheme("", "갑"), null);
});
