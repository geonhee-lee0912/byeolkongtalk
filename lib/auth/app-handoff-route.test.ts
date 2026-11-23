// 웹뷰 쿠키 발급 라우트(app/api/auth/app/handoff)의 관문 — 앱이 아닌 브라우저는 교환 코드를 쓰지 않는다(login CSRF 차단).
// 코드는 헤더(HANDOFF_CODE_HEADER)로만 받는다 — 주소에 실린 code 는 앱 UA 라도 무시한다(딥링크·next 로 남의 코드를 먹이는 앱 안 login CSRF 차단).
// DB 는 supabase-js 가 부르는 fetch 를 가짜로 바꿔 흉내 낸다(실 DB·네트워크 없음 — 로컬에 표가 없어도 돈다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { HANDOFF_CODE_HEADER } from "@/lib/app-bridge/protocol";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

const USER = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";
const APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ByeolkongApp/1.0.0 (ios)";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** 교환 코드 표에 간 요청 수 — 앱 UA 가 아니거나 코드가 헤더에 없으면 0 이어야 한다(코드를 태우지도 않는다) */
let codeClaims = 0;
globalThis.fetch = (async (input: unknown) => {
  const u = new URL(String(input));
  if (u.pathname === "/rest/v1/app_handoff_codes") {
    codeClaims++;
    return Response.json([{ user_id: USER, is_new_user: true }]);
  }
  throw new Error(`app-handoff-route.test: 예상 밖 네트워크 호출 — ${u.href}`);
}) as typeof fetch;

type Route = { GET: (request: NextRequest) => Promise<Response> };
let loaded: Promise<Route> | null = null;
const load = () => (loaded ??= import("@/app/api/auth/app/handoff/route") as Promise<Route>);
/** codeIn="header" = 앱이 여는 모양(코드는 헤더) / "query" = 딥링크·next 로 남이 먹이는 모양(코드는 주소에만) */
async function call(ua: string, mode: "login" | "launch", codeIn: "header" | "query" = "header") {
  const { GET } = await load();
  const headers: Record<string, string> = { "user-agent": ua };
  if (codeIn === "header") headers[HANDOFF_CODE_HEADER] = "c";
  const codeQuery = codeIn === "query" ? "code=c&" : "";
  return GET(new NextRequest(`http://localhost:3000/api/auth/app/handoff?${codeQuery}next=/fortune&mode=${mode}`, { headers }));
}
const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("byeolkong_user_id="));

test("앱 UA 가 아니면 코드를 쓰지 않는다 — 코드 표 요청 0, 세션 쿠키 없음(login 은 handoff_invalid, launch 는 그냥 next)", async () => {
  codeClaims = 0;
  const login = await call(SAFARI_UA, "login");
  assert.equal(new URL(login.headers.get("location")!).searchParams.get("reason"), "handoff_invalid");
  assert.equal(sessionCookie(login), undefined);
  const launch = await call(SAFARI_UA, "launch");
  const loc = new URL(launch.headers.get("location")!);
  assert.equal(loc.pathname + loc.search, "/fortune");
  assert.equal(sessionCookie(launch), undefined);
  assert.equal(codeClaims, 0);
});

test("앱 UA 면 코드를 쓰고 세션 쿠키 + login=success·welcome=1, 캐시 금지", async () => {
  codeClaims = 0;
  const res = await call(APP_UA, "login");
  assert.equal(codeClaims, 1);
  assert.match(sessionCookie(res) ?? "", new RegExp(`^byeolkong_user_id=${USER};`));
  const loc = new URL(res.headers.get("location")!);
  assert.equal(loc.pathname, "/fortune");
  assert.equal(loc.searchParams.get("login"), "success");
  assert.equal(loc.searchParams.get("welcome"), "1");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("앱 UA 라도 코드가 주소에만 있으면 쓰지 않는다 — 코드 표 요청 0, 세션 쿠키 없음(login 은 handoff_invalid, launch 는 그냥 next)", async () => {
  codeClaims = 0;
  const login = await call(APP_UA, "login", "query");
  assert.equal(new URL(login.headers.get("location")!).searchParams.get("reason"), "handoff_invalid");
  assert.equal(sessionCookie(login), undefined);
  const launch = await call(APP_UA, "launch", "query");
  const loc = new URL(launch.headers.get("location")!);
  assert.equal(loc.pathname + loc.search, "/fortune");
  assert.equal(sessionCookie(launch), undefined);
  assert.equal(codeClaims, 0);
});
