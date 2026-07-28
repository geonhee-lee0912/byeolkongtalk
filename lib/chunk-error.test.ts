import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunkErrorDeploymentId,
  isChunkLoadError,
  tryRecoverFromChunkError,
} from "./chunk-error.ts";

/**
 * prod 실제 조건을 재현한 브라우저 스텁.
 *
 * ⚠️ `document.documentElement.dataset.dplId` 는 **prod 에서도 항상 비어 있다**.
 * next 런타임(`shared/lib/deployment-id.js`)이 모듈 초기화 시점에 읽고 즉시
 * `delete` 하기 때문에, 앱 코드가 도는 시점에는 속성이 이미 없다.
 * (2026-07-28 prod 실측: raw HTML 에는 data-dpl-id 있음 / 런타임 DOM 에는 없음)
 */
function fakeBrowser() {
  let reloads = 0;
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { location: { reload: () => void reloads++ } };
  g.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  g.document = { documentElement: { dataset: {} } };
  return {
    reloads: () => reloads,
    cleanup() {
      delete g.window;
      delete g.sessionStorage;
      delete g.document;
    },
  };
}

function withClock<T>(fn: (advance: (ms: number) => void) => T): T {
  const realNow = Date.now;
  let t = 1_700_000_000_000;
  Date.now = () => t;
  try {
    return fn((ms) => {
      t += ms;
    });
  } finally {
    Date.now = realNow;
  }
}

const CHUNK_ERR = new Error(
  "Failed to load chunk /_next/static/chunks/0kffyt0bf.ut4.js?dpl=dpl_BukUiZKawC8L8EaDTzTLfAAqWJHb from module 64893",
);

test("실패한 청크 URL 에서 배포 ID 를 뽑는다 (스큐/결손 트리아지용)", () => {
  // 2026-07-28 prod 실측: 이 탭의 빌드는 dpl_BukUiZ..., 당시 현행 prod 는 dpl_9Mgr6Y...
  // → 다르므로 배포 스큐. 같았다면 현 빌드에 청크가 없는 진짜 버그였다.
  assert.equal(
    chunkErrorDeploymentId(CHUNK_ERR),
    "dpl_BukUiZKawC8L8EaDTzTLfAAqWJHb",
  );
  assert.equal(chunkErrorDeploymentId(new Error("Loading chunk 843 failed.")), null);
  assert.equal(chunkErrorDeploymentId(null), null);
});

test("새 배포의 스큐는 같은 세션에서도 다시 자활한다", () => {
  const env = fakeBrowser();
  try {
    withClock((advance) => {
      assert.equal(tryRecoverFromChunkError(CHUNK_ERR), true, "1회차 자활");
      advance(30 * 60_000); // 30분 뒤 새 배포 → 새로운 스큐
      assert.equal(
        tryRecoverFromChunkError(CHUNK_ERR),
        true,
        "새 스큐인데 자활하지 않았다 — 세션당 1회로 잠긴 것",
      );
      assert.equal(env.reloads(), 2);
    });
  } finally {
    env.cleanup();
  }
});

test("직후 재발은 자활하지 않는다 (리로드 루프 방지)", () => {
  const env = fakeBrowser();
  try {
    withClock((advance) => {
      assert.equal(tryRecoverFromChunkError(CHUNK_ERR), true);
      advance(2_000); // 리로드했는데 2초 만에 또 났다 = 리로드로 안 고쳐진다
      assert.equal(tryRecoverFromChunkError(CHUNK_ERR), false);
      assert.equal(env.reloads(), 1);
    });
  } finally {
    env.cleanup();
  }
});

test("자활은 세션당 상한이 있다", () => {
  const env = fakeBrowser();
  try {
    withClock((advance) => {
      for (let i = 0; i < 8; i++) {
        tryRecoverFromChunkError(CHUNK_ERR);
        advance(30 * 60_000);
      }
      assert.ok(
        env.reloads() <= 3,
        `무한 자활 방지 상한 초과: ${env.reloads()}회`,
      );
    });
  } finally {
    env.cleanup();
  }
});

test("청크 에러가 아니면 자활하지 않는다", () => {
  const env = fakeBrowser();
  try {
    assert.equal(
      tryRecoverFromChunkError(new Error("Cannot read properties of undefined")),
      false,
    );
    assert.equal(env.reloads(), 0);
  } finally {
    env.cleanup();
  }
});

test("turbopack 청크 로드 실패 — prod 실제 메시지", () => {
  // 2026-07-28 prod error_logs 원문 (route=/readings)
  const e = new Error(
    "Failed to load chunk /_next/static/chunks/0kffyt0bf.ut4.js?dpl=dpl_BukUiZKawC8L8EaDTzTLfAAqWJHb from module 64893",
  );
  assert.equal(isChunkLoadError(e), true);
});

test("webpack 폴백 번들러의 ChunkLoadError", () => {
  const e = new Error("Loading chunk 843 failed.");
  e.name = "ChunkLoadError";
  assert.equal(isChunkLoadError(e), true);
  assert.equal(isChunkLoadError(new Error("Loading CSS chunk 12 failed.")), true);
});

test("네이티브 동적 import 실패", () => {
  assert.equal(
    isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/a.js")),
    true,
  );
});

test("일반 앱 에러는 청크 에러가 아니다", () => {
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(new Error("리딩을 불러오지 못했어")), false);
});

test("Error 가 아닌 값에도 안전", () => {
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError("Failed to load chunk /a.js from module 1"), true);
});
