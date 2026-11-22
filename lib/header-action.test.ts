import { test } from "node:test";
import assert from "node:assert/strict";
import { getHeaderAction, setHeaderAction, subscribeHeaderAction } from "./header-action";

test("화면이 올린 헤더 버튼을 헤더가 읽고, 내리면 비워진다", () => {
  const onClick = () => {};
  setHeaderAction({ label: "결과 보기", onClick, disabled: true });
  assert.deepEqual(getHeaderAction(), { label: "결과 보기", onClick, disabled: true });
  setHeaderAction(null);
  assert.equal(getHeaderAction(), null);
});

test("바뀔 때마다 구독자에게 알리고, 구독을 끊으면 더 안 알린다", () => {
  let calls = 0;
  const off = subscribeHeaderAction(() => calls++);
  setHeaderAction({ label: "결과 보기", onClick: () => {} });
  setHeaderAction(null);
  assert.equal(calls, 2);
  off();
  setHeaderAction({ label: "결과 보기", onClick: () => {} });
  assert.equal(calls, 2);
  setHeaderAction(null);
});
