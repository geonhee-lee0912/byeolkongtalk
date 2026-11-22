import { test } from "node:test";
import assert from "node:assert/strict";
import { SPREAD_INFO } from "./spreads";
import { MULTI_ROW_SLOT_LAYOUTS } from "./slot-layout";

test("자리 배치: 여러 줄 스프레드는 모든 자리가 한 번씩·번호 순서로, 한 줄에 3장까지", () => {
  for (const { type, cardCount } of Object.values(SPREAD_INFO)) {
    if (type === "relationship_5") continue; // 전용 모양(2×2 + 오른쪽 1)
    const rows = MULTI_ROW_SLOT_LAYOUTS[cardCount];
    if (cardCount <= 3) {
      assert.equal(rows, undefined, `${type}: 3장 이하는 한 줄`);
      continue;
    }
    assert.ok(rows, `${type}: ${cardCount}장 배치가 없다`);
    assert.deepEqual(rows.flat(), [...Array(cardCount).keys()], type);
    assert.ok(rows.every((r) => r.length <= 3), type);
  }
});
