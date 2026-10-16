// 웹 ↔ 앱(React Native 웹뷰) 약속 — 웹과 앱이 같이 쓰는 단일 원천. 의존성 0(next·react·react-native import 금지).
// 앱은 Metro watchFolders 로 이 파일을 그대로 가져간다(mobile/metro.config.js). 스펙 2026-10-12-앱-1 §5.
// 🔴 앱 토큰은 어떤 메시지로도 웹에 넘기지 않는다. 결제(②)·알림(③) 메시지는 그 단계에서 여기에 더한다.

/** 메시지 형식 버전. 🔴 올리지 말 것 — 웹은 늘 현장의 옛 앱보다 새것이라, 올리는 순간 옛 앱이 auth.loggedOut 까지 전부 버린다.
 *  형식을 바꿔야 하면 새 type 을 더한다(옛 앱은 모르는 type 만 버린다) */
export const BRIDGE_VERSION = 1;
/** 앱 웹뷰 UA 끝에 붙는 표식 — `ByeolkongApp/<버전> (<ios|android>)` */
export const APP_UA_TOKEN = "ByeolkongApp";
/** 웹뷰 쿠키 발급(handoff) 요청에서 교환 코드를 싣는 헤더 — 주소엔 싣지 않는다(서버는 주소의 code 를 보지 않는다).
 *  앱(mobile/src/urls.ts handoffSource)이 붙이고 서버(app/api/auth/app/handoff)가 읽는다. 🔴 이름을 바꾸면 현장의 옛 앱 로그인이 막힌다 */
export const HANDOFF_CODE_HEADER = "X-Byeolkong-Handoff";

export type AppPlatform = "ios" | "android";
/** 앱이 문서 시작 전에 window.__BYEOLKONG_APP__ 로 주입하는 값 */
export type AppInfo = { version: string; platform: AppPlatform };

/** 웹이 앱에 보내는 메시지 종류 — 이 목록이 단일 원천이다(타입도 여기서 나온다). 목록에 없는 종류는 앱이 버린다 */
const WEB_TO_APP_TYPES = ["auth.loggedOut"] as const;
export type WebToAppType = (typeof WEB_TO_APP_TYPES)[number];
export type WebToAppMessage = { v: typeof BRIDGE_VERSION; type: WebToAppType; payload: Record<string, never> };

/** UA 꼬리에 싣는 버전 — UA_RE 가 읽는 문자([0-9A-Za-z._-]) 밖은 "_" 로 바꾸고 32자로 자른다. 비면 "0".
 *  🔴 서버 관문(handoff·reset)은 이 꼬리가 parseAppUserAgent 로 읽혀야 앱으로 본다. 못 읽는 꼬리("1.0.0+5"·공백·빈 값)를 만들면
 *  앱 로그인이 오류 하나 없이 막힌다 — 그래서 꼬리는 늘 읽히는 모양으로만 만든다(protocol.test.ts 왕복 테스트가 지킨다) */
function uaVersion(version: string): string {
  return version.replace(/[^0-9A-Za-z._-]+/g, "_").slice(0, 32) || "0";
}

export function appUserAgentSuffix(info: AppInfo): string {
  return `${APP_UA_TOKEN}/${uaVersion(info.version)} (${info.platform})`;
}

/** 버전 문자·길이는 uaVersion 과 같다(길이 상한 — UA 는 누구나 보낼 수 있어 읽은 버전을 어디에 남겨도 커지지 않게) */
const UA_RE = /ByeolkongApp\/([0-9A-Za-z._-]{1,32}) \((ios|android)\)/;

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

function isWebToAppType(t: unknown): t is WebToAppType {
  return (WEB_TO_APP_TYPES as readonly unknown[]).includes(t);
}

/** 앱이 받은 문자열 → 아는 메시지면 새로 만든 그 메시지(웹이 보낸 payload 는 쓰지 않는다), 아니면 null(모르는 건 버린다) */
export function parseWebToApp(raw: string): WebToAppMessage | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown> | null;
    if (!m || m.v !== BRIDGE_VERSION || !isWebToAppType(m.type)) return null;
    return { v: BRIDGE_VERSION, type: m.type, payload: {} };
  } catch {
    return null;
  }
}
