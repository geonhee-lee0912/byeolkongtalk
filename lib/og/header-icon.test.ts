// 계약: 타로·사주 공유 그림 머리는 이모지가 아니라 상품 그림(운영자 11-22 시안16 B)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { getHeaderIconDataUrl } from "./header-icon.ts";

test("타로·사주 머리 그림을 144 정사각 PNG 로 읽어 준다", async () => {
  for (const kind of ["tarot", "saju"] as const) {
    const url = await getHeaderIconDataUrl(kind);
    assert.ok(url, kind);
    assert.ok(url.startsWith("data:image/png;base64,"), kind);
    const meta = await sharp(Buffer.from(url.split(",")[1], "base64")).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ["png", 144, 144], kind);
  }
});

test("공유 그림 머리에 이모지가 없고 상품 그림을 쓴다", () => {
  for (const [kind, emoji] of [["tarot", "<span>🃏</span>"], ["saju", ">✨</span>"]] as const) {
    const s = readFileSync(`app/api/og/${kind}/[readingId]/route.tsx`, "utf8");
    assert.ok(!s.includes(emoji), kind);
    assert.ok(s.includes(`getHeaderIconDataUrl("${kind}")`), kind);
  }
});
