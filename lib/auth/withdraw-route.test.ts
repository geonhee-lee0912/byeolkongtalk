// 회원 탈퇴 라우트(app/api/auth/withdraw/route.ts) — 되돌릴 수 없는 경로라 '어디서 멈추고(503) 어디서 진행하나',
// 탈퇴 원장 해시(웰컴 별 원장과 같은 공식)·삭제 대상·순서를 잠근다(스펙 2026-10-12-앱-1 §9).
// 의존성은 resolve 훅으로 ./withdraw-route.fakes.ts 로 바꿔 끼운다. 로그인 수단 조회(lib/auth/user-identity.ts)·해시·복호화는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { encryptSecret } from "./token-crypto.ts";
import type * as Fakes from "./withdraw-route.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(카카오·애플·DB 는 전부 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`withdraw-route.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const BASE = "http://localhost:3000";
process.env.NEXT_PUBLIC_BASE_URL = BASE;
const KEY = randomBytes(32).toString("base64");
process.env.APPLE_TOKEN_ENC_KEY = KEY;

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./withdraw-route.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/supabase.ts", "/lib/session.ts", "/lib/kakao.ts", "/lib/logger.ts", "/lib/auth/apple.ts"];

type Route = { POST: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load(): Promise<Route> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST } = await import("@/app/api/auth/withdraw/route");
    return { POST, fakes };
  })();
  return loaded;
}

const KAKAO_ID = 4123456789;
const APPLE_SUB = "001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.0123";
const APPLE_CLIENT = "com.byeolkongtalk.app.dev";
const APPLE_REFRESH = "r0.apple-refresh-token";
const ACQ = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "c1",
  utm_content: "atc_love",
  utm_term: null,
  landing_variant: "v1",
  referrer: "https://l.instagram.com/",
  first_seen_at: "2026-10-01T00:00:00Z",
};
const MSG_RETRY = "탈퇴 처리 중 문제가 생겼어. 잠시 후 다시 시도하거나 고객센터로 문의해줘";
const MSG_KAKAO = "카카오 연결 해제에 실패했어. 잠시 후 다시 시도하거나 고객센터로 문의해줘";
const MSG_APPLE = "애플 연결 해제에 실패했어. 잠시 후 다시 시도하거나 고객센터로 문의해줘";

/** 웰컴 별·탈퇴 원장에 2026-07 부터 쌓인 카카오 공식 — 바뀌면 탈퇴→재가입이 웰컴 별을 또 받는다 */
const kakaoLedgerHash = (id: number) => createHash("sha256").update(String(id)).digest("hex");
/** 애플은 카카오 값과 겹치지 않게 접두를 붙인다(가입 때 웰컴 별 청구와 같은 값이어야 재가입이 이어진다) */
const appleLedgerHash = (sub: string) => createHash("sha256").update(`apple:${sub}`).digest("hex");

const kakaoRow = () => ({
  provider: "kakao",
  provider_user_id: String(KAKAO_ID),
  apple_client_id: null,
  apple_refresh_token_enc: null,
});
const appleRow = (patch: Record<string, unknown> = {}) => ({
  provider: "apple",
  provider_user_id: APPLE_SUB,
  apple_client_id: APPLE_CLIENT,
  apple_refresh_token_enc: encryptSecret(APPLE_REFRESH, KEY),
  ...patch,
});

/** 준비(setup)로 가짜 상태를 채운 뒤 탈퇴를 한 번 부른다 */
async function withdraw(
  setup: (s: typeof Fakes.state) => void = () => {},
  headers: Record<string, string> = { origin: BASE },
) {
  const { POST, fakes } = await load();
  fakes.reset();
  setup(fakes.state);
  const res = await POST(new NextRequest(`${BASE}/api/auth/withdraw`, { method: "POST", headers }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, s: fakes.state, USER_ID: fakes.USER_ID };
}

/** 멈춘 경로 — 탈퇴 원장·삭제·쿠키 정리 중 아무것도 안 했다 */
function assertStoppedBeforeDelete(s: typeof Fakes.state) {
  assert.deepEqual(s.inserts, []);
  assert.deepEqual(s.deletes, []);
  assert.ok(!s.calls.includes("clearAllCookies"));
}
const hasLog = (s: typeof Fakes.state, level: string, extra: Record<string, unknown>) =>
  s.logs.some((l) => l.level === level && Object.entries(extra).every(([k, v]) => l.extra[k] === v));

test("카카오 회원 — 수단 조회 → unlink → 유입 스냅샷 → 탈퇴 원장(옛 공식 해시) → 별 → 회원 삭제 → 쿠키 정리", async () => {
  const { status, body, s, USER_ID } = await withdraw((st) => {
    st.identities = [kakaoRow()];
    st.acquisition = ACQ;
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true });
  assert.deepEqual(s.calls, [
    "getSession",
    "select:user_identities",
    `unlinkKakao:${KAKAO_ID}`,
    "select:user_acquisition",
    "insert:account_withdrawals",
    "delete:star_transactions",
    "delete:star_balances",
    "delete:users",
    "clearAllCookies",
  ]);
  // 읽는 것도 전부 이 회원 것
  assert.deepEqual(s.selects, [
    { table: "user_identities", filters: [["user_id", USER_ID]] },
    { table: "user_acquisition", filters: [["user_id", USER_ID]] },
  ]);
  assert.deepEqual(s.inserts, [{ table: "account_withdrawals", row: { kakao_id_hash: kakaoLedgerHash(KAKAO_ID), ...ACQ } }]);
  // 지우는 건 전부 이 회원 것
  assert.deepEqual(s.deletes, [
    { table: "star_transactions", filters: [["user_id", USER_ID]] },
    { table: "star_balances", filters: [["user_id", USER_ID]] },
    { table: "users", filters: [["id", USER_ID]] },
  ]);
  assert.deepEqual(s.logs, []);
});

test("옮겨 담기 전 카카오 회원(로그인 수단 행 없음) — users.kakao_id 로 보충해 unlink, 원장 해시도 같은 공식", async () => {
  const { status, s, USER_ID } = await withdraw((st) => {
    st.identities = [];
    st.userRow = { kakao_id: KAKAO_ID };
  });
  assert.equal(status, 200);
  assert.deepEqual(s.calls.slice(0, 4), ["getSession", "select:user_identities", "select:users", `unlinkKakao:${KAKAO_ID}`]);
  assert.deepEqual(s.selects[1], { table: "users", filters: [["id", USER_ID]] });
  assert.equal(s.inserts[0].row.kakao_id_hash, kakaoLedgerHash(KAKAO_ID));
  assert.ok(s.calls.includes("delete:users"));
});

test("로그인 수단 조회가 실패하면(수단 표·보충 조회 어느 쪽이든) 503 으로 멈춘다 — '수단 없음'으로 보고 지우지 않는다", async () => {
  const cases: [string, (st: typeof Fakes.state) => void, string[]][] = [
    ["수단 표 오류", (st) => (st.identitiesError = { message: "boom", code: "XX000" }), ["getSession", "select:user_identities"]],
    [
      "보충 조회 오류",
      (st) => {
        st.identities = [];
        st.userError = { message: "boom", code: "XX000" };
      },
      ["getSession", "select:user_identities", "select:users"],
    ],
  ];
  for (const [name, setup, calls] of cases) {
    const { status, body, s } = await withdraw(setup);
    assert.equal(status, 503, name);
    assert.deepEqual(body, { error: MSG_RETRY }, name);
    assert.deepEqual(s.calls, calls, name); // unlink·revoke·원장·삭제·쿠키 정리 0
    assert.ok(hasLog(s, "error", { severity: "WITHDRAW_IDENTITY_LOOKUP_FAILED" }), name);
  }
});

test("카카오 unlink 실패 → 503, 원장·삭제·쿠키 정리 0, 오류 로그에 카카오 상태·코드", async () => {
  const { status, body, s } = await withdraw((st) => {
    st.identities = [kakaoRow()];
    st.kakaoUnlink = { ok: false, alreadyUnlinked: false, status: 500, code: -1 };
  });
  assert.equal(status, 503);
  assert.deepEqual(body, { error: MSG_KAKAO });
  assert.deepEqual(s.calls, ["getSession", "select:user_identities", `unlinkKakao:${KAKAO_ID}`]);
  assertStoppedBeforeDelete(s);
  assert.ok(hasLog(s, "error", { severity: "WITHDRAW_UNLINK_FAILED", kakaoStatus: 500, kakaoCode: -1 }));
});

test("카카오 -101(유저가 카카오 설정에서 이미 끊음) → info 남기고 탈퇴 진행 — 막으면 그 회원은 영구히 탈퇴 못 한다", async () => {
  const { status, s } = await withdraw((st) => {
    st.identities = [kakaoRow()];
    st.kakaoUnlink = { ok: false, alreadyUnlinked: true, status: 400, code: -101 };
  });
  assert.equal(status, 200);
  assert.ok(s.calls.includes("delete:users"));
  assert.deepEqual(
    s.logs.map((l) => [l.level, l.message]),
    [["info", "Kakao already unlinked before withdraw — proceeding"]],
  );
});

test("애플 회원 — 저장된 토큰을 풀어 그 토큰을 발급한 client_id 로 revoke → 원장은 'apple:' 해시 → 삭제 (카카오 unlink 없음)", async () => {
  const { status, s } = await withdraw((st) => {
    st.identities = [appleRow()];
    st.acquisition = ACQ;
  });
  assert.equal(status, 200);
  assert.deepEqual(s.calls, [
    "getSession",
    "select:user_identities",
    "revokeApple",
    "select:user_acquisition",
    "insert:account_withdrawals",
    "delete:star_transactions",
    "delete:star_balances",
    "delete:users",
    "clearAllCookies",
  ]);
  assert.deepEqual(s.appleRevokes, [{ refreshToken: APPLE_REFRESH, clientId: APPLE_CLIENT }]); // 암호문이 아니라 푼 토큰
  assert.deepEqual(s.inserts, [{ table: "account_withdrawals", row: { kakao_id_hash: appleLedgerHash(APPLE_SUB), ...ACQ } }]);
  assert.deepEqual(s.logs, []);
});

test("애플 revoke 실패(애플 장애·설정 오류) → 503, 원장·삭제·쿠키 정리 0, 오류 로그", async () => {
  const { status, body, s } = await withdraw((st) => {
    st.identities = [appleRow()];
    st.appleRevokeError = new Error("apple revoke 500 error=null");
  });
  assert.equal(status, 503);
  assert.deepEqual(body, { error: MSG_APPLE });
  assert.deepEqual(s.calls, ["getSession", "select:user_identities", "revokeApple"]);
  assertStoppedBeforeDelete(s);
  assert.ok(hasLog(s, "error", { severity: "WITHDRAW_APPLE_REVOKE_FAILED" }));
  assert.ok(hasLog(s, "error", { step: "apple_revoke" }));
});

// 🟡 결정 대기(계획 '남은 일' — 못 푸는 토큰이면 탈퇴 503 벽). 지금은 (a) 멈춘다. (b) 로 정하면 이 테스트를 같이 바꾼다
test("애플 토큰을 못 풀면(다른 키로 암호화·키 env 없음·형식 깨짐) revoke 없이 503 — 지금 결정 (a)", async () => {
  const otherKey = randomBytes(32).toString("base64");
  const cases: [string, Record<string, unknown>, boolean][] = [
    ["다른 키로 암호화", { apple_refresh_token_enc: encryptSecret(APPLE_REFRESH, otherKey) }, false],
    ["형식 깨짐", { apple_refresh_token_enc: "not-a-v1-blob" }, false],
    ["키 env 없음", {}, true],
  ];
  for (const [name, patch, dropKey] of cases) {
    if (dropKey) delete process.env.APPLE_TOKEN_ENC_KEY;
    try {
      const { status, body, s } = await withdraw((st) => (st.identities = [appleRow(patch)]));
      assert.equal(status, 503, name);
      assert.deepEqual(body, { error: MSG_APPLE }, name);
      assert.deepEqual(s.appleRevokes, [], name);
      assertStoppedBeforeDelete(s);
      assert.ok(hasLog(s, "error", { step: "apple_decrypt" }), name);
      assert.ok(hasLog(s, "error", { severity: "WITHDRAW_APPLE_REVOKE_FAILED" }), name);
    } finally {
      process.env.APPLE_TOKEN_ENC_KEY = KEY;
    }
  }
});

test("애플 토큰이 없으면(가입 때 인가 코드 교환 실패) 회수할 게 없다 — 경고 남기고 진행, 원장은 애플 해시", async () => {
  const cases: [string, Record<string, unknown>][] = [
    ["토큰 없음", { apple_refresh_token_enc: null }],
    ["client_id 없음", { apple_client_id: null }],
  ];
  for (const [name, patch] of cases) {
    const { status, s } = await withdraw((st) => (st.identities = [appleRow(patch)]));
    assert.equal(status, 200, name);
    assert.deepEqual(s.appleRevokes, [], name);
    assert.deepEqual(
      s.logs.map((l) => [l.level, l.message]),
      [["warn", "Apple refresh token missing at withdraw — proceeding without revoke"]],
      name,
    );
    assert.equal(s.inserts[0].row.kakao_id_hash, appleLedgerHash(APPLE_SUB), name);
    assert.ok(s.calls.includes("delete:users"), name);
    assert.ok(s.calls.includes("clearAllCookies"), name);
  }
});

test("끊는 법을 모르는 로그인 수단 → 503 으로 멈춘다(연결을 남긴 채 지우지 않는다)", async () => {
  const { status, body, s } = await withdraw(
    (st) =>
      (st.identities = [{ provider: "google", provider_user_id: "g-1", apple_client_id: null, apple_refresh_token_enc: null }]),
  );
  assert.equal(status, 503);
  assert.deepEqual(body, { error: MSG_RETRY });
  assert.deepEqual(s.appleRevokes, []);
  assertStoppedBeforeDelete(s);
  assert.ok(hasLog(s, "error", { severity: "WITHDRAW_UNKNOWN_PROVIDER" }));
});

test("로그인 수단이 둘이면 둘 다 끊는다 — 하나라도 실패하면 503, 원장 해시는 먼저 붙은 수단(①엔 병합이 없지만 표 구조상 가능)", async () => {
  const ok = await withdraw((st) => (st.identities = [kakaoRow(), appleRow()]));
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.s.calls.slice(0, 4), ["getSession", "select:user_identities", `unlinkKakao:${KAKAO_ID}`, "revokeApple"]);
  assert.equal(ok.s.inserts[0].row.kakao_id_hash, kakaoLedgerHash(KAKAO_ID));

  const fail = await withdraw((st) => {
    st.identities = [kakaoRow(), appleRow()];
    st.appleRevokeError = new Error("apple revoke 400 error=invalid_client");
  });
  assert.equal(fail.status, 503);
  assert.deepEqual(fail.body, { error: MSG_APPLE });
  assertStoppedBeforeDelete(fail.s);
});

test("회원 삭제 실패 → 500, 쿠키 정리 없음, 오류 로그(dbCode) — 연결은 이미 끊겼으니 다시 누르면 -101(info)로 진행된다", async () => {
  const { status, body, s } = await withdraw((st) => {
    st.identities = [kakaoRow()];
    st.userDeleteError = { message: "fk violation", code: "23503" };
  });
  assert.equal(status, 500);
  assert.deepEqual(body, { error: MSG_RETRY });
  assert.ok(!s.calls.includes("clearAllCookies"));
  assert.ok(hasLog(s, "error", { severity: "WITHDRAW_USER_DELETE_FAILED", dbCode: "23503" }));
});

test("탈퇴 원장 기록이 실패해도 탈퇴는 진행(best-effort) + 오류 로그", async () => {
  const { status, s } = await withdraw((st) => {
    st.identities = [kakaoRow()];
    st.withdrawalInsertError = { message: "insert failed", code: "XX000" };
  });
  assert.equal(status, 200);
  assert.ok(s.calls.includes("delete:users"));
  assert.ok(s.calls.includes("clearAllCookies"));
  assert.ok(hasLog(s, "error", { severity: "WITHDRAWAL_LOG_FAILED" }));
});

test("로그인 수단이 하나도 없으면(이미 지워진 회원 — 연타·동시 요청) 끊기·원장 없이 삭제만, 200", async () => {
  const { status, s } = await withdraw((st) => {
    st.identities = [];
    st.userRow = null;
  });
  assert.equal(status, 200);
  assert.deepEqual(s.calls, [
    "getSession",
    "select:user_identities",
    "select:users",
    "delete:star_transactions",
    "delete:star_balances",
    "delete:users",
    "clearAllCookies",
  ]);
  assert.deepEqual(s.inserts, []);
});

test("CSRF — 다른 Origin 이면 403(세션·DB·외부 호출 0), Origin 이 없어도 Referer 가 우리 주소면 통과", async () => {
  const blocked = await withdraw((st) => (st.identities = [kakaoRow()]), { origin: "https://evil.example" });
  assert.equal(blocked.status, 403);
  assert.deepEqual(blocked.body, { error: "csrf_blocked" });
  assert.deepEqual(blocked.s.calls, []);

  const viaReferer = await withdraw(() => {}, { referer: `${BASE}/mypage` });
  assert.equal(viaReferer.status, 200);
});

test("세션 없음 → 401, DB·외부 호출 0", async () => {
  const { status, body, s } = await withdraw((st) => {
    st.sessionUserId = null;
    st.identities = [kakaoRow()];
  });
  assert.equal(status, 401);
  assert.deepEqual(body, { error: "Login required" });
  assert.deepEqual(s.calls, ["getSession"]);
});
