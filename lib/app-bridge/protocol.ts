// 웹 ↔ 앱(React Native 웹뷰) 약속 — 웹과 앱이 같이 쓰는 단일 원천. 의존성 0(next·react·react-native import 금지).
// 앱은 Metro watchFolders 로 이 파일을 그대로 가져간다(mobile/metro.config.js). 스펙 2026-10-12-앱-1 §5.
// 🔴 앱 토큰은 어떤 메시지로도 웹에 넘기지 않는다. 결제(②)·알림(③) 메시지는 그 단계에서 여기에 더한다.

export const BRIDGE_VERSION = 1;
/** 앱 웹뷰 UA 끝에 붙는 표식 — `ByeolkongApp/<버전> (<ios|android>)` */
export const APP_UA_TOKEN = "ByeolkongApp";

export type AppPlatform = "ios" | "android";
/** 앱이 문서 시작 전에 window.__BYEOLKONG_APP__ 로 주입하는 값 */
export type AppInfo = { version: string; platform: AppPlatform };

/** 웹이 앱에 보내는 메시지 종류 */
export type WebToAppType = "auth.loggedOut";
export type WebToAppMessage = { v: typeof BRIDGE_VERSION; type: WebToAppType; payload: Record<string, never> };
const WEB_TO_APP_TYPES: readonly string[] = ["auth.loggedOut"];

export function appUserAgentSuffix(info: AppInfo): string {
  return `${APP_UA_TOKEN}/${info.version} (${info.platform})`;
}

const UA_RE = /ByeolkongApp\/([0-9A-Za-z._-]+) \((ios|android)\)/;

export function parseAppUserAgent(ua: string | null | undefined): AppInfo | null {
  if (!ua) return null;
  const m = UA_RE.exec(ua);
  return m ? { version: m[1], platform: m[2] as AppPlatform } : null;
}

export function isAppInfo(v: unknown): v is AppInfo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.version === "string" && (o.platform === "ios" || o.platform === "android");
}

export function encodeWebToApp(type: WebToAppType): string {
  const msg: WebToAppMessage = { v: BRIDGE_VERSION, type, payload: {} };
  return JSON.stringify(msg);
}

/** 앱이 받은 문자열 → 아는 메시지면 그 메시지, 아니면 null(모르는 건 버린다) */
export function parseWebToApp(raw: string): WebToAppMessage | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown> | null;
    if (!m || m.v !== BRIDGE_VERSION || typeof m.type !== "string" || !WEB_TO_APP_TYPES.includes(m.type)) return null;
    return { v: BRIDGE_VERSION, type: m.type as WebToAppType, payload: {} };
  } catch {
    return null;
  }
}
