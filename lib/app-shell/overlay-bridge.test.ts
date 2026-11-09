import { test } from "node:test";
import assert from "node:assert/strict";
import { createOverlayStack } from "./overlay-stack.ts";
import { installOverlayBridge, type BridgeWindow } from "./overlay-bridge.ts";
import { APP_EVENT, encodeAppToWebBack, type AppInfo } from "../app-bridge/protocol.ts";

const UI_APP: AppInfo = { version: "1.2.0", platform: "android", caps: ["push", "ui"] };
const OLD_APP: AppInfo = { version: "1.1.0", platform: "android", caps: ["push"] };

function fakeWin() {
  const sent: unknown[] = [];
  const listeners = new Map<string, Set<(e: Event) => void>>();
  const win: BridgeWindow = {
    ReactNativeWebView: { postMessage: (m: string) => sent.push(JSON.parse(m)) },
    addEventListener: (t, f) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(f);
    },
    removeEventListener: (t, f) => listeners.get(t)?.delete(f),
  };
  const fire = (detail: unknown) => {
    for (const f of listeners.get(APP_EVENT) ?? []) f({ detail } as unknown as Event);
  };
  const count = () => listeners.get(APP_EVENT)?.size ?? 0;
  return { win, sent, fire, count };
}
const entry = (close: () => void, dismiss = true, z = 80) => ({ close, canDismiss: () => dismiss, z });

test("cap 없으면 아무것도 안 보낸다", () => {
  const { win, sent, fire, count } = fakeWin();
  const stack = createOverlayStack(() => {});
  let closed = 0;
  installOverlayBridge(win, stack, OLD_APP);
  stack.push(entry(() => closed++));
  fire(encodeAppToWebBack());
  assert.deepEqual(sent, []);
  assert.equal(closed, 0);
  assert.equal(count(), 0);
});

test("열림·닫힘을 한 번씩 보낸다", () => {
  const { win, sent } = fakeWin();
  const stack = createOverlayStack(() => {});
  installOverlayBridge(win, stack, UI_APP);
  const ra = stack.push(entry(() => {}));
  const rb = stack.push(entry(() => {}));
  rb();
  ra();
  assert.deepEqual(
    sent.map((m) => (m as { payload: { open: boolean } }).payload.open),
    [true, false],
  );
  assert.equal((sent[0] as { type: string }).type, "ui.overlay");
});

test("이미 열린 채로 설치되면 열림을 바로 알린다", () => {
  const { win, sent } = fakeWin();
  const stack = createOverlayStack(() => {});
  stack.push(entry(() => {}));
  installOverlayBridge(win, stack, UI_APP);
  assert.deepEqual(sent, [{ v: 1, type: "ui.overlay", payload: { open: true } }]);
});

test("ui.back 이 오면 맨 위를 닫는다", () => {
  const { win, fire } = fakeWin();
  const stack = createOverlayStack(() => {});
  const log: string[] = [];
  installOverlayBridge(win, stack, UI_APP);
  stack.push(entry(() => log.push("under")));
  stack.push(entry(() => log.push("top")));
  fire(encodeAppToWebBack());
  assert.deepEqual(log, ["top"]);
});

test("ui.back 에 닫을 수 없는 창은 그대로", () => {
  const { win, fire } = fakeWin();
  const stack = createOverlayStack(() => {});
  const log: string[] = [];
  installOverlayBridge(win, stack, UI_APP);
  stack.push(entry(() => log.push("under")));
  stack.push(entry(() => log.push("legal"), false));
  fire(encodeAppToWebBack());
  assert.deepEqual(log, []);
});

test("모르는 이벤트는 무시하고, 떼면 더 듣지 않는다", () => {
  const { win, fire, count, sent } = fakeWin();
  const stack = createOverlayStack(() => {});
  const log: string[] = [];
  const off = installOverlayBridge(win, stack, UI_APP);
  stack.push(entry(() => log.push("x")));
  fire('{"v":1,"type":"push.state","state":"granted"}');
  fire("{");
  assert.deepEqual(log, []);
  off();
  assert.equal(count(), 0);
  const before = sent.length;
  stack.push(entry(() => {}));
  fire(encodeAppToWebBack());
  assert.deepEqual(log, []);
  assert.equal(sent.length, before);
});
