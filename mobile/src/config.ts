// 앱 설정 — app.config.ts 의 extra(빌드 때 정해진다). 변형별 기준 주소·주소 체계·(개발용만) Vercel 우회 값. 읽는 규칙은 extra.ts
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { AppInfo } from "../../lib/app-bridge/protocol.ts";
import { parseAppExtra } from "./extra.ts";

export const config = parseAppExtra(Constants.expoConfig?.extra);

/** 웹에 알려 주는 앱 정보 — UA 꼬리·window.__BYEOLKONG_APP__ (lib/app-bridge/protocol.ts) */
export const appInfo: AppInfo = {
  version: Constants.expoConfig?.version ?? "0",
  platform: Platform.OS === "ios" ? "ios" : "android",
};
