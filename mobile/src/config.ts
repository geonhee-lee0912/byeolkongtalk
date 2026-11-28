// 앱 설정 — app.config.ts 의 extra(빌드 때 정해진다). 변형별 기준 주소·주소 체계·(개발용만) Vercel 우회 값. 읽는 규칙은 extra.ts
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { AppInfo } from "../../lib/app-bridge/protocol.ts";
import { parseAppExtra } from "./extra.ts";

export const config = parseAppExtra(Constants.expoConfig?.extra);

/** 웹에 알려 주는 앱 정보 — UA 꼬리·window.__BYEOLKONG_APP__ (lib/app-bridge/protocol.ts) */
export const appInfo: AppInfo = {
  version: Constants.expoConfig?.version ?? "0",
  platform: Platform.OS === "ios" ? "ios" : "android",
  // 웹은 이 표시가 있을 때만 알림 메시지(push.*)·화면 메시지(ui.* — 겹창·뒤로 버튼·진동·새로고침)를 보낸다
  // (lib/app-bridge/protocol.ts hasCap) — 옛 앱엔 없다. 앱 결제(iap.*)는 스토어 모듈(expo-iap 의 ExpoIap)이 든 빌드에서만 —
  // 없는 빌드(Expo Go 등)에서 웹이 스토어 가격을 기다리며 버튼을 막지 않게
  caps: ["push", "ui", ...(requireOptionalNativeModule("ExpoIap") ? ["iap"] : [])],
};
