import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchWallet, parseWallet, type WalletSource } from "./wallet.ts";
import { menuArmOf } from "./tarot/menu-ab.ts";

test("parseWallet — 정상 응답", () => {
  assert.deepEqual(parseWallet({ balance: 15, isGuest: false, giftUnused: true, menuArm: "menu" }), {
    balance: 15,
    isGuest: false,
    giftUnused: true,
    menuArm: "menu",
  });
  assert.deepEqual(parseWallet({ balance: 0, isGuest: true, giftUnused: false, menuArm: "legacy" }), {
    balance: 0,
    isGuest: true,
    giftUnused: false,
    menuArm: "legacy",
  });
});

test("parseWallet — 모르는 값·실패는 안전한 쪽(잔액 0 · 게스트 · 선물 약속 없음 · 스위치가 정한 비로그인 그룹)", () => {
  const safe = { balance: 0, isGuest: true, giftUnused: false, menuArm: menuArmOf(null) };
  assert.deepEqual(parseWallet(null), safe);
  assert.deepEqual(parseWallet(undefined), safe);
  assert.deepEqual(parseWallet({ balance: "3", giftUnused: "true", menuArm: "x" }), safe);
});

type SentEvent = { event: string; meta?: { status?: number | string; source?: string } };

/**
 * globalThis.fetch 를 잠깐 바꿔 /api/stars/balance 는 respond 가 답하게 하고, /api/event 로 나간 본문은 sent 에 모은다.
 * respond 는 fetch 가 받은 init(signal 포함)을 받는다 · timeoutMs 를 주면 fetchWallet 의 제한 시간으로 넘긴다(생략 = 기본값).
 * source 는 fetchWallet 에 넘기는 지면 라벨(생략 = "shop") — 실패 이벤트의 meta.source 로 돌아와야 한다.
 * 끝나면(finally) 원래 fetch 로 되돌린다.
 */
async function fetchWalletWith(
  respond: (init?: RequestInit) => Promise<Response>,
  timeoutMs?: number,
  source: WalletSource = "shop"
) {
  const original = globalThis.fetch;
  const sent: SentEvent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "/api/event") {
      sent.push(JSON.parse(String(init?.body)) as SentEvent);
      return new Response(null, { status: 204 });
    }
    return respond(init);
  }) as typeof fetch;
  try {
    const wallet = await fetchWallet(source, timeoutMs);
    return { wallet, sent };
  } finally {
    globalThis.fetch = original;
  }
}

// trackUiEvent 는 navigator 가 있어야 발사한다(노드 21+). 없는 노드에선 이벤트 단언만 건너뛴다.
const canTrack = typeof navigator !== "undefined";

test("fetchWallet — 200 이면 응답을 parseWallet 한 값(모르는 필드는 버린다) · 이벤트는 안 남긴다", async () => {
  const body = { balance: 15, isGuest: false, giftUnused: true, menuArm: "menu", extra: "버려진다" };
  const { wallet, sent } = await fetchWalletWith(async () => new Response(JSON.stringify(body), { status: 200 }));
  assert.deepEqual(wallet, { balance: 15, isGuest: false, giftUnused: true, menuArm: "menu" });
  assert.deepEqual(sent, []);
});

test("fetchWallet — 500 이면 null · wallet_fetch_failed(status:500, source) 를 남긴다", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => new Response("boom", { status: 500 }));
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: 500, source: "shop" } }]);
});

test("fetchWallet — fetch 가 던지면 null · status 는 'network'", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "network", source: "shop" } }]);
});

test("fetchWallet — 200 인데 본문이 JSON 이 아니어도 null · 받은 응답 상태(200)로 센다", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => new Response("<html>not json</html>", { status: 200 }));
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: 200, source: "shop" } }]);
});

// ── 제한 시간 ── 기본값(5초)을 그대로 두면 테스트가 5초 걸리니 짧은 값을 넣는다. { timeout } 은 구현이 깨졌을 때 테스트가 매달리지 않게 하는 안전망이자,
// 넘긴 값이 실제로 쓰였는지(기본 5초였다면 2초를 넘겨 실패)의 확인이다.

/** 안 끝나는 fetch — 브라우저처럼 signal 이 abort 돼야만 AbortError 로 끝난다. signal 을 안 넘겼으면 바로 실패시킨다 */
function neverEndingFetch(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error("fetchWallet 이 signal 을 안 넘겼다"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

test("fetchWallet — 제한 시간 안에 안 끝나면 끊고 null · status 는 'timeout'", { timeout: 2000 }, async () => {
  const { wallet, sent } = await fetchWalletWith(neverEndingFetch, 20);
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "timeout", source: "shop" } }]);
});

test("fetchWallet — 응답 헤더는 왔는데 본문이 안 끝나도 제한 시간에 끊는다(본문 읽기까지 덮는다) · status 는 200 이 아니라 'timeout'", { timeout: 2000 }, async () => {
  const { wallet, sent } = await fetchWalletWith(async (init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { status: 200 });
  }, 20);
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "timeout", source: "shop" } }]);
});

test("fetchWallet — 정상 응답이면 타이머를 남기지 않는다(제한 시간이 지나도 signal 이 abort 되지 않는다)", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const { wallet } = await fetchWalletWith(async (init) => {
    signals.push(init?.signal);
    return new Response(JSON.stringify({ balance: 3, isGuest: false }), { status: 200 });
  }, 100);
  assert.equal(wallet?.balance, 3);
  await new Promise((resolve) => setTimeout(resolve, 250)); // 제한 시간(100ms)을 넉넉히 넘겨 기다린다 — 타이머가 남았다면 그 사이 abort 된다
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.aborted, false);
});

// ── 호출 지면 라벨(wallet_fetch_failed 의 meta.source) ──
// 같은 경로의 화면도 지면이 달라 실패의 해로움이 다르다(lib/wallet.ts WalletSource). 이 표가 아래 계약들의 기준이다.
// Record 타입이라 지면을 더하고 여기에 안 적으면 tsc 가 막는다(분류가 빠진 채 감시 쿼리와 어긋나지 않게).
const KIND: Record<WalletSource, "harmful" | "harmless"> = {
  tarot_router: "harmful",
  tarot_draw: "harmful",
  recharge_sheet: "harmful",
  shop: "harmful",
  continuation_modal: "harmful",
  home: "harmless",
  reading_end: "harmless",
  result: "harmless",
};
const SOURCES = Object.keys(KIND) as WalletSource[];

test("fetchWallet — 실패 이벤트에 부른 지면 라벨이 그대로 실린다(지면 전부)", async () => {
  assert.ok(SOURCES.length > 0);
  for (const source of SOURCES) {
    const { sent } = await fetchWalletWith(async () => new Response("boom", { status: 500 }), undefined, source);
    if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: 500, source } }], source);
  }
});

test("감시 쿼리(scripts/menu-ab-daily-check.sql) wallet_fail 의 harmful·harmless 목록 = 지면 분류(모든 지면이 한 번씩)", () => {
  // 주석 속 같은 문구는 목록이 아니다
  const sql = readFileSync(new URL("../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  const sqlKinds: Record<string, string[]> = {};
  for (const m of sql.matchAll(/when\s+source\s+in\s*\(([^)]*)\)\s+then\s+'(harmful|harmless)'/g)) {
    sqlKinds[m[2]] = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  }
  const sourcesOf = (kind: string) => SOURCES.filter((s) => KIND[s] === kind).sort();
  // 두 목록이 모든 지면을 겹침 없이 덮어야 한다 — 빠진 지면은 unknown 으로 떨어지고, 잘못 든 지면은 고장 집계를 부풀리거나 숨긴다
  assert.deepEqual(sqlKinds, { harmful: sourcesOf("harmful"), harmless: sourcesOf("harmless") });
});

// 계약 — 지면마다 자기 라벨로 지갑을 읽는다. 타입은 라벨이 "유효한가"만 보장한다 — 뽑기 화면을 "home" 으로 달아도 tsc 는 통과하고,
// 그러면 해로운 실패가 무해한 쪽으로 세어져 감시가 못 본다(복사해 붙이다 라벨을 안 고치는 사고).
const ROOT = join(import.meta.dirname, "..");
const SOURCE_BY_FILE: Record<string, WalletSource> = {
  "app/page.tsx": "home",
  "app/tarot/page.tsx": "tarot_router",
  "app/tarot/draw/page.tsx": "tarot_draw",
  "app/tarot/reading/page.tsx": "reading_end",
  "app/tarot/result/page.tsx": "result",
  "app/shop/page.tsx": "shop",
  "components/upsell/RechargeSheet.tsx": "recharge_sheet",
  "components/continuation/ContinuationModal.tsx": "continuation_modal",
};
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("지갑을 읽는 지면은 각자 자기 라벨로 부른다 — 지면마다 라벨 하나, 라벨마다 지면 하나 이상", () => {
  const problems: string[] = [];
  for (const [file, label] of Object.entries(SOURCE_BY_FILE)) {
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    const labels = [...new Set([...src.matchAll(/\b(?:useWallet|fetchWallet)\(\s*"([a-z_]+)"\s*\)/g)].map((m) => m[1]))];
    if (labels.length !== 1 || labels[0] !== label) {
      problems.push(`${file} — "${label}" 라벨로 불러야 한다(찾은 라벨: ${labels.join(", ") || "없음"})`);
    }
  }
  assert.deepEqual(problems, [], `지면이 남의 라벨로 지갑을 읽으면 해로운 실패가 무해한 쪽으로 센다:\n  ${problems.join("\n  ")}`);
  // 쓰는 지면이 없는 라벨(= 이 표에서 빠진 지면)이 없어야 한다
  assert.deepEqual([...new Set(Object.values(SOURCE_BY_FILE))].sort(), [...SOURCES].sort(), "SOURCE_BY_FILE 에 없는 지면 라벨이 있다");
});
