import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isShareCancel } from "./share-cancel.ts";

test("기기 공유창을 닫은 것(AbortError)만 취소로 본다", () => {
  assert.equal(isShareCancel(new DOMException("Share canceled", "AbortError")), true);
  assert.equal(isShareCancel(new DOMException("denied", "NotAllowedError")), false);
  assert.equal(isShareCancel(new TypeError("no share")), false);
  assert.equal(isShareCancel(null), false);
});

test("별마루 공유: 취소하면 복사도 성공 기록도 하지 않고 끝난다", () => {
  const s = readFileSync("components/byeolmaru/ByeolmaruShareButton.tsx", "utf8");
  assert.match(s, /if \(isShareCancel\(e\)\) return;/);
});
