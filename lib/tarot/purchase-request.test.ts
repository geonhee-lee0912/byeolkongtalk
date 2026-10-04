import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseRequest } from "./purchase-request.ts";

// 전역 fetch 를 대체해 시간 제한·본문 처리를 고정한다 — 각 테스트가 끝나면 원복한다
async function withFetch(stub: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

// signal 이 abort 되면 reject 하는 대기 — 끝나지 않는 요청을 흉내 낸다
function hangUntilAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(abortError()));
  });
}

test("purchaseRequest — 정상 응답은 status·ok·본문(JSON)을 돌려준다", async () => {
  await withFetch((async () => new Response(JSON.stringify({ drawnCards: [], reopened: true }), { status: 200 })) as typeof fetch, async () => {
    const r = await purchaseRequest<{ drawnCards: unknown[]; reopened: boolean }>("/x", { method: "POST" });
    assert.equal(r.status, 200);
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, { drawnCards: [], reopened: true });
  });
});

test("purchaseRequest — 4xx·5xx 도 본문 에러 코드를 읽는다(던지지 않는다)", async () => {
  await withFetch((async () => new Response(JSON.stringify({ error: "purchase_in_progress" }), { status: 409 })) as typeof fetch, async () => {
    const r = await purchaseRequest<{ error?: string }>("/x", { method: "POST" });
    assert.equal(r.status, 409);
    assert.equal(r.ok, false);
    assert.equal(r.data.error, "purchase_in_progress");
  });
});

test("purchaseRequest — 본문이 JSON 이 아니면 빈 객체", async () => {
  await withFetch((async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch, async () => {
    const r = await purchaseRequest<{ error?: string }>("/x", { method: "POST" });
    assert.equal(r.status, 502);
    assert.deepEqual(r.data, {});
  });
});

test("purchaseRequest — 시간 안에 응답이 없으면 abort 해 AbortError 로 던진다", async () => {
  let receivedSignal: AbortSignal | null | undefined;
  await withFetch(((_url: unknown, init?: RequestInit) => {
    receivedSignal = init?.signal;
    return hangUntilAborted(init?.signal);
  }) as typeof fetch, async () => {
    await assert.rejects(
      purchaseRequest("/x", { method: "POST" }, 30),
      (e: unknown) => (e as Error).name === "AbortError",
    );
    assert.equal(receivedSignal?.aborted, true);
  });
});

test("purchaseRequest — 본문을 읽는 중 시간이 끝나면 빈 본문으로 성공 취급하지 않고 던진다", async () => {
  await withFetch(((_url: unknown, init?: RequestInit) =>
    Promise.resolve({
      status: 200,
      ok: true,
      json: () => hangUntilAborted(init?.signal),
    } as unknown as Response)) as typeof fetch, async () => {
    await assert.rejects(
      purchaseRequest("/x", { method: "POST" }, 30),
      (e: unknown) => (e as Error).name === "AbortError",
    );
  });
});

test("purchaseRequest — 호출부가 준 옵션(method·body)은 그대로 넘기고 signal 만 더한다", async () => {
  let seen: RequestInit | undefined;
  await withFetch((async (_url: unknown, init?: RequestInit) => {
    seen = init;
    return new Response("{}", { status: 200 });
  }) as typeof fetch, async () => {
    await purchaseRequest("/x", { method: "POST", body: "payload", headers: { "Content-Type": "application/json" } });
    assert.equal(seen?.method, "POST");
    assert.equal(seen?.body, "payload");
    assert.deepEqual(seen?.headers, { "Content-Type": "application/json" });
    assert.ok(seen?.signal instanceof AbortSignal);
  });
});
