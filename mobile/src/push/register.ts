// 알림 권한·푸시 토큰 등록/해제 — OS·서버 호출(순수 판단은 state.ts). 스펙 2026-11-06-앱-알림 단계 1.
// 🔴 푸시 토큰·앱 토큰은 웹에 넘기지 않는다 — 웹엔 권한 상태(PushState)만 알린다(WebScreen).
// 🔴 여기서 나는 실패는 앱 부팅·웹뷰를 막지 않는다 — 전부 삼키고 console.warn. 등록은 다음 실행 때 syncPushToken 이 다시 한다.
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { PushState } from "../../../lib/app-bridge/protocol.ts";
import { postJson } from "../auth/api";
import { appInfo } from "../config";
import { toPushState, UNSUBSCRIBE_ACTION } from "./state.ts";

/** 이 기기의 Expo 푸시 토큰 — 로그아웃 때 서버에서 지울 토큰 */
const TOKEN_KEY = "push_token";
/** 안드로이드 알림 채널 — 서버가 보내는 channelId 와 같다(lib/push/expo.ts). 정보성 / 광고(설계 §6-2) */
const CHANNEL_ID = "info";
const AD_CHANNEL_ID = "ad";
/** 광고 알림 카테고리 — [수신거부] 버튼(설계 §4-7). 서버가 광고에 categoryId "ad" 를 싣는다 */
const AD_CATEGORY_ID = "ad";

/** 앱이 앞에 떠 있을 때 받은 알림도 배너로 보인다 */
export function showNotificationsInForeground(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn("[push] 앞 화면 알림 설정 실패", e);
  }
}

async function readPermission(): Promise<PushState> {
  const p = await Notifications.getPermissionsAsync();
  return toPushState({ status: p.status, canAskAgain: p.canAskAgain });
}

/** 지금 권한 상태. 못 읽으면 undetermined(웹은 다시 묻기만 한다) */
export async function getPushState(): Promise<PushState> {
  try {
    return await readPermission();
  } catch (e) {
    console.warn("[push] 권한 상태를 못 읽었다", e);
    return "undetermined";
  }
}

/** Expo 토큰을 받아 서버에 이 회원 기기로 등록한다. 로그인 안 됨이면 등록하지 않는다(로그인 뒤 syncPushToken 이 한다). 던지지 않는다 */
async function register(ensureToken: () => Promise<string | null>): Promise<void> {
  try {
    // 시뮬레이터·에뮬레이터는 푸시 토큰을 못 받는다
    if (!Device.isDevice) return;
    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== "string" || !projectId) {
      console.warn("[push] eas.projectId 가 없다 — 토큰 등록을 건너뛴다");
      return;
    }
    const access = await ensureToken();
    if (!access) return;
    // 안드로이드는 채널을 먼저 만들어야 토큰을 받는다(Expo SDK 58 문서) — 부팅 때 만든 것과 같다(있으면 그대로)
    await ensureAndroidChannel();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await postJson("/api/push/devices", { token, platform: appInfo.platform, appVersion: appInfo.version }, access);
    await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  } catch (e) {
    console.warn("[push] 토큰 등록 실패 — 다음 실행 때 다시", e);
  }
}

/** 웹의 '알림 받을래' — 물을 수 있으면 OS 에 묻고, 허락이면 토큰 등록을 건다. 결과 권한 상태를 돌려준다(던지지 않는다).
 *  다시 못 묻는 거부(denied)는 OS 창을 띄우지 않는다 — 웹이 설정 열기로 안내한다 */
export async function requestPush(ensureToken: () => Promise<string | null>): Promise<PushState> {
  let state: PushState;
  try {
    state = await readPermission();
    if (state === "undetermined") {
      const p = await Notifications.requestPermissionsAsync();
      state = toPushState({ status: p.status, canAskAgain: p.canAskAgain });
    }
  } catch (e) {
    console.warn("[push] 권한 요청 실패", e);
    return getPushState();
  }
  // 등록(토큰 받기·서버 호출)은 기다리지 않는다 — 웹은 답을 정해진 시간만 기다리고(lib/app-push.ts) 요청 id 가 없어서, 늦은 답이 다음 요청의 답으로 읽힌다
  if (state === "granted") void register(ensureToken);
  return state;
}

/** 앱 실행·로그인 때 — 이미 허락돼 있으면 다시 등록한다(토큰이 바뀌었을 수 있다. 서버는 같은 토큰이면 덮어쓴다) */
export async function syncPushToken(ensureToken: () => Promise<string | null>): Promise<void> {
  try {
    if ((await readPermission()) === "granted") await register(ensureToken);
  } catch (e) {
    console.warn("[push] 토큰 다시 등록 실패", e);
  }
}

/** 로그아웃 — 기억한 토큰을 서버에서 지운다(로그인 없이 받는 라우트). 실패해도 던지지 않는다 — 기억한 토큰은 남겨 두고 다음 로그인 때 새 회원으로 덮인다 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await postJson("/api/push/devices", { token }, undefined, "DELETE");
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    console.warn("[push] 토큰 해제 실패", e);
  }
}

/** 안드로이드 8+ 는 채널이 있어야 알림이 뜬다. 13+ 의 권한 창도 채널이 하나는 있어야 뜬다(Expo 문서) — 부팅 때 만든다(있으면 그대로).
 *  🔴 중요도는 처음 만들 때만 먹는다(그 뒤엔 사용자 몫) — 정보성 알림이라 DEFAULT(소리·알림창, 화면 위 팝업 없음) */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "별콩이 알림",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    // 광고 — 사용자가 OS 설정에서 이 채널만 따로 끌 수 있다. 중요도는 정보성과 같은 DEFAULT(운영자 결정 11-06 을 따름)
    await Notifications.setNotificationChannelAsync(AD_CHANNEL_ID, {
      name: "혜택·소식",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (e) {
    console.warn("[push] 알림 채널 만들기 실패", e);
  }
}

/** 광고 알림의 [수신거부] 버튼(iOS 카테고리 · 안드로이드 액션) — 누르면 앱이 앞으로 열려 수신거부 화면을 연다(WebScreen).
 *  아이폰은 알림을 길게 눌러야 버튼이 보인다 — 그래서 열린 화면에도 같은 철회 줄이 있다(웹 PushGate) */
export async function ensureNotificationCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(AD_CATEGORY_ID, [
      { identifier: UNSUBSCRIBE_ACTION, buttonTitle: "수신거부", options: { opensAppToForeground: true } },
    ]);
  } catch (e) {
    console.warn("[push] 알림 버튼 만들기 실패", e);
  }
}
