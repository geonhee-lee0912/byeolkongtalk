// 실 저장소(app-session-store.ts)가 보내는 PostgREST 요청을 잠근다 — 재사용 감지·1회용의 핵심은 조건부 UPDATE 의 필터라서,
// 필터 하나가 빠지면(예: rotated_at IS NULL) 메모리 저장소 테스트는 다 통과하는데 실제로는 교체된 토큰이 또 교체된다.
// supabase-js 가 만든 HTTP 요청을 가짜 fetch 로 받는다(실 DB·네트워크 없음).
import { test } from "node:test";
import assert from "node:assert/strict";
import { supabaseAppSessionStore } from "./app-session-store.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

type Sent = { method: string; table: string; params: Record<string, string>; prefer: string; body: unknown };
/** 요청을 모으고 reply 로 답한다(배열 = 반환 행, null = 204, 숫자 = 그 상태 코드의 오류) */
function capture(reply: unknown[] | null | number = []) {
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const u = new URL(String(input));
    sent.push({
      method: init.method ?? "GET",
      table: u.pathname.replace("/rest/v1/", ""),
      params: Object.fromEntries(u.searchParams),
      prefer: new Headers(init.headers).get("prefer") ?? "",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (typeof reply === "number") return Response.json({ code: "XX000", message: "boom", details: null, hint: null }, { status: reply });
    return reply === null ? new Response(null, { status: 204 }) : Response.json(reply);
  }) as typeof fetch;
  return sent;
}
const NOW = "2026-10-12T00:00:01.000Z";

test("claimRefresh — 교체·폐기 전·만료 전 조건을 건 UPDATE … RETURNING 한 번, 0행이면 null·1행이면 그 행", async () => {
  let sent = capture([]);
  assert.equal(await supabaseAppSessionStore().claimRefresh("h1", NOW), null);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    method: "PATCH",
    table: "app_refresh_tokens",
    params: { token_hash: "eq.h1", rotated_at: "is.null", revoked_at: "is.null", expires_at: `gt.${NOW}`, select: "user_id,family_id,platform" },
    prefer: sent[0].prefer,
    body: { rotated_at: NOW },
  });
  assert.match(sent[0].prefer, /return=representation/);

  sent = capture([{ user_id: "u1", family_id: "f1", platform: null }]);
  assert.deepEqual(await supabaseAppSessionStore().claimRefresh("h1", NOW), { user_id: "u1", family_id: "f1", platform: null });
});

test("releaseRefresh — 그 claim 이 남긴 rotated_at 일 때만 비운다", async () => {
  const sent = capture(null);
  await supabaseAppSessionStore().releaseRefresh("h1", NOW);
  assert.deepEqual(
    sent.map(({ method, table, params, body }) => ({ method, table, params, body })),
    [{ method: "PATCH", table: "app_refresh_tokens", params: { token_hash: "eq.h1", rotated_at: `eq.${NOW}` }, body: { rotated_at: null } }],
  );
});

test("revokeFamily — 그 묶음의 아직 안 폐기된 행 전부", async () => {
  const sent = capture(null);
  await supabaseAppSessionStore().revokeFamily("f1", NOW);
  assert.deepEqual(
    sent.map(({ method, table, params, body }) => ({ method, table, params, body })),
    [{ method: "PATCH", table: "app_refresh_tokens", params: { family_id: "eq.f1", revoked_at: "is.null" }, body: { revoked_at: NOW } }],
  );
});

test("claimHandoff — 안 쓰였고 만료 전일 때만 used_at 표시(1회용), 0행이면 null", async () => {
  let sent = capture([]);
  assert.equal(await supabaseAppSessionStore().claimHandoff("c1", NOW), null);
  assert.deepEqual(
    sent.map(({ method, table, params, body }) => ({ method, table, params, body })),
    [
      {
        method: "PATCH",
        table: "app_handoff_codes",
        params: { code_hash: "eq.c1", used_at: "is.null", expires_at: `gt.${NOW}`, select: "user_id,is_new_user" },
        body: { used_at: NOW },
      },
    ],
  );
  sent = capture([{ user_id: "u1", is_new_user: true }]);
  assert.deepEqual(await supabaseAppSessionStore().claimHandoff("c1", NOW), { user_id: "u1", is_new_user: true });
});

test("DB 오류는 던진다 — 라우트가 500 + 오류 로그로 받는다(조용히 null 이 되면 invalid 로 오판)", async () => {
  // 500 으로 — 503 은 supabase-js 가 GET 을 1·2·4초 재시도해 테스트가 7초 걸린다
  capture(500);
  await assert.rejects(supabaseAppSessionStore().claimRefresh("h1", NOW));
  capture(500);
  await assert.rejects(supabaseAppSessionStore().findRefresh("h1"));
});
