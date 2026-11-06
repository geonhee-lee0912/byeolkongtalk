// 기기 등록·해제 핸들러 — 라우트는 세션을 읽어 여기로 넘기기만 한다.
import * as realStore from "./store";

export type HandlerResult = { status: number; body: object };

const TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;

function obj(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export async function handleDevicePost(
  body: unknown,
  userId: string | null,
  store: Pick<typeof realStore, "upsertDevice"> = realStore,
): Promise<HandlerResult> {
  if (!userId) return { status: 401, body: { error: "unauthorized" } };
  const b = obj(body);
  const { token, platform } = b;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { status: 400, body: { error: "bad_token" } };
  if (platform !== "ios" && platform !== "android") return { status: 400, body: { error: "bad_platform" } };
  const appVersion = typeof b.appVersion === "string" && b.appVersion.length <= 32 ? b.appVersion : null;
  await store.upsertDevice({ token, userId, platform, appVersion });
  return { status: 200, body: { ok: true } };
}

// 로그인 없이 받는다 — 토큰을 아는 기기만 지울 수 있고, 지워서 얻는 것이 없다.
export async function handleDeviceDelete(
  body: unknown,
  store: Pick<typeof realStore, "deleteDevice"> = realStore,
): Promise<HandlerResult> {
  const { token } = obj(body);
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { status: 400, body: { error: "bad_token" } };
  await store.deleteDevice(token);
  return { status: 200, body: { ok: true } };
}
