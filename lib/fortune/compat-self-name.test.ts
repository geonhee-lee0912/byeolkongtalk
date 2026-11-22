// 궁합 프롬프트에는 로그인 닉네임·이름(본인 프로필의 display_name — 애플이면 실명일 수 있다)을 싣지 않는다(운영자 결정 2026-11-22).
// 실제 라우트를 돌려 AI 자리에 넘어간 값을 본다. 본인은 자리(첫째·둘째)가 아니라 프로필로 가린다.
// 화면용으로 저장하는 이름(readings.saju_data.names)은 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./compat-self-name.fakes.ts";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`compat-self-name.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./compat-self-name.fakes.ts", import.meta.url).href;
const FAKED = [
  "supabase",
  "session",
  "stars",
  "reading-dedupe",
  "relationship/closed",
  "relationship/passes",
  "logger",
  "meta-capi",
  "claude",
].map((m) => `/lib/${m}.ts`);

type Post = (request: NextRequest) => Promise<Response>;
let loaded: Promise<{ fakes: typeof Fakes; fortune: Post; thread: Post }> | null = null;
function load() {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        // after() 는 요청 범위 밖에서 던진다 — 운세 생성 라우트에서만 가짜로
        if (specifier === "next/server" && context.parentURL?.includes("/app/api/fortune/create/route.ts")) {
          return { url: FAKES_URL, shortCircuit: true };
        }
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const fortune = (await import("@/app/api/fortune/create/route")).POST;
    const thread = (await import("@/app/api/relationship/chat/route")).POST;
    return { fakes, fortune, thread };
  })();
  return loaded;
}

const SELF_NAME = "가짜성가짜이름";
const profile = (id: string, display_name: string, is_primary: boolean, relation_type: string) => ({
  id,
  display_name,
  is_primary,
  relation_type,
  birth_date: "1997-03-14",
  birth_time: null,
  is_lunar_input: false,
  is_leap_month: false,
  gender: "other",
});
const ME = profile("me", SELF_NAME, true, "self");
const OLD_ME = profile("old-me", SELF_NAME, false, "self"); // 옛 저장 경로(/api/readings)가 남긴 '본인인데 대표가 아닌' 행
const FRIEND = profile("friend", "민수", false, "friend");
const PARTNER = profile("partner", "지우", false, "partner");

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });

const CASES = [
  { title: "본인이 첫째", a: ME, b: FRIEND, sent: ["나", "민수"] },
  { title: "본인이 둘째", a: FRIEND, b: ME, sent: ["민수", "나"] },
  { title: "대표가 아닌 본인 행", a: FRIEND, b: OLD_ME, sent: ["민수", "나"] },
  { title: "본인이 없으면 입력한 이름 그대로", a: PARTNER, b: FRIEND, sent: ["지우", "민수"] },
];

for (const type of ["compat", "compat_social"]) {
  for (const { title, a, b, sent } of CASES) {
    test(`${type} — ${title}`, async () => {
      const { fakes, fortune } = await load();
      fakes.reset();
      fakes.state.profiles = [a, b];
      const res = await fortune(post("/api/fortune/create", { type, profileA: a.id, profileB: b.id, force: true }));
      assert.equal(res.status, 200);
      for (const job of fakes.state.background) await job();

      assert.equal(fakes.state.prompts.length, 2, "첫 호출 + 파싱 실패 재시도");
      for (const prompt of fakes.state.prompts) {
        assert.ok(!prompt.includes(SELF_NAME), "본인 이름이 AI 입력에 실렸다");
        assert.ok(prompt.includes(`첫 번째 사람 사주판 — ${sent[0]}]`), `첫째 이름은 ${sent[0]}`);
        assert.ok(prompt.includes(`두 번째 사람 사주판 — ${sent[1]}]`), `둘째 이름은 ${sent[1]}`);
      }
      const stored = fakes.state.readings[0].saju_data as { names: unknown };
      assert.deepEqual(stored.names, { a: a.display_name, b: b.display_name }, "화면용 저장 이름은 그대로");
    });
  }
}

test("우리 사이 궁합 스킬(종료를 되돌려도) — 본인은 나", async () => {
  const { fakes, thread } = await load();
  fakes.reset();
  fakes.state.profiles = [ME, PARTNER];
  fakes.state.relationship = {
    id: "rel",
    user_id: "test-user",
    self_profile_id: ME.id,
    partner_profile_id: PARTNER.id,
    thread_reading_id: "thread",
    memo: {},
  };
  await thread(post("/api/relationship/chat", { relationshipId: "rel", skillStart: "compat" }));

  assert.equal(fakes.state.prompts.length, 2, "첫 호출 + 파싱 실패 재시도");
  for (const prompt of fakes.state.prompts) {
    assert.ok(!prompt.includes(SELF_NAME), "본인 이름이 AI 입력에 실렸다");
    assert.ok(prompt.includes("첫 번째 사람 사주판 — 나]"));
    assert.ok(prompt.includes("두 번째 사람 사주판 — 지우]"));
  }
});
