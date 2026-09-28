// 업스트림 연결이 **응답 도중** 끊겼을 때 재시도 분류가 맞는가 — 실물 소켓 절단으로 검증한다.
//
// 배경(2026-09-28 prod, /api/relationship/chat "TypeError: terminated"):
// 이 라우트는 CHAT_MODEL(gpt-5.6-luna) → openai 어댑터를 탄다. OpenAI SDK 의 Stream 은
// anthropic SDK 와 달리 body 스트림 에러를 감싸지 않고 **그대로** 던지므로, undici 가 만든
// `TypeError: terminated`(status 없음)가 그대로 올라온다. 어댑터의 재시도 판정이 status 만
// 보고 있어 연결 단절은 한 번도 재시도된 적이 없었다.
//
// 🔴 이 파일이 **가짜 객체 대신 실제 에러**를 쓰는 이유:
//    upstream-error.test.ts 의 `{ name: "APIConnectionError" }` 단정은 통과하는데 실물은 안
//    잡혔다 — SDK 의 에러 클래스들은 `name` 을 설정하지 않아 실제 값이 "Error" 다. 모양을
//    손으로 지어내면 같은 착각이 또 생긴다. 여기선 소켓을 진짜로 끊어서 받은 객체로 판정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import OpenAI from "openai";
import { openaiAdapter } from "./openai.ts";

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({
    id: "c", object: "chat.completion.chunk", created: 1, model: "m",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })}\n\n`;
}

/** 소켓을 kill 시점에 맞춰 끊는 서버를 띄우고, 스트림을 소비하다 받은 에러를 돌려준다. */
async function errorFromKilledStream(kill: "before-headers" | "mid-body"): Promise<unknown> {
  const server = http.createServer((_req, res) => {
    if (kill === "before-headers") {
      res.socket!.destroy();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(sseChunk("내가 보기엔 지금 너희 사이엔"));
    setTimeout(() => res.socket!.destroy(), 50);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as { port: number };

  try {
    const client = new OpenAI({ apiKey: "test-key", baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 });
    const stream = await client.chat.completions.create({
      model: "m", stream: true, messages: [{ role: "user", content: "안녕" }],
    });
    for await (const _ of stream) {
      /* 소비만 — 서버가 도중에 끊는다 */
    }
    return null; // 에러가 안 났으면 테스트가 실패해야 한다
  } catch (err) {
    return err;
  } finally {
    server.close();
  }
}

test("응답 도중 소켓 단절(prod 2026-09-28 형태)은 재시도 대상", async () => {
  const err = await errorFromKilledStream("mid-body");
  assert.ok(err instanceof Error, "소켓 단절이면 에러가 던져져야 한다");
  // prod 로그와 같은 모양인지 먼저 고정 — 이 단정이 깨지면 런타임이 바뀐 것이다.
  assert.equal(err.message, "terminated");
  assert.equal((err as Error).name, "TypeError");
  assert.equal((err as { status?: number }).status, undefined, "연결 단절엔 status 가 없다");
  assert.equal(openaiAdapter.isRetryableError(err), true);
});

test("연결 자체 실패(APIConnectionError)도 재시도 대상", async () => {
  const err = await errorFromKilledStream("before-headers");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "Connection error.");
  // 🔴 실제 SDK 에러는 name 이 "Error" 다 — name 으로 분기하면 절대 안 잡힌다.
  assert.equal((err as Error).name, "Error");
  assert.equal(err.constructor.name, "APIConnectionError");
  assert.equal(openaiAdapter.isRetryableError(err), true);
});

test("클라이언트 오류(400)는 여전히 재시도 안 함 — 연결 오류와 섞이면 안 된다", () => {
  assert.equal(openaiAdapter.isRetryableError({ status: 400, message: "bad request" }), false);
  assert.equal(openaiAdapter.isRetryableError(new Error("empty_assistant_stream")), false);
});
