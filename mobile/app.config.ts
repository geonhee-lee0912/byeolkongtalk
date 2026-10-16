// 별콩톡 앱 설정 — 변형 2벌(APP_VARIANT=production | 그 밖은 development). 스펙 2026-10-12-앱-1 §4.
// 🔴 리포가 공개다: 카카오 네이티브 앱 키·Vercel 우회 값은 여기 적지 말고 EAS 환경 변수(로컬은 셸 환경 변수)로 넣는다.
import type { ExpoConfig } from "expo/config";

const IS_PROD = process.env.APP_VARIANT === "production";
const SCHEME = IS_PROD ? "byeolkong" : "byeolkong-dev";
const BUNDLE_ID = IS_PROD ? "com.byeolkongtalk.app" : "com.byeolkongtalk.app.dev";

const config: ExpoConfig = {
  name: IS_PROD ? "별콩톡" : "별콩톡 dev",
  slug: "byeolkongtalk",
  version: "1.0.0",
  scheme: SCHEME,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FAF6F0" },
  },
  plugins: [
    // 웹뷰 첫 화면이 뜰 때까지 유지(src/WebScreen.tsx 가 hideAsync)
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#FAF6F0" }],
    // 카카오 SDK 안드로이드 저장소
    ["expo-build-properties", { android: { extraMavenRepos: ["https://devrepo.kakao.com/nexus/content/groups/public/"] } }],
    ["@react-native-seoul/kakao-login", { kakaoAppKey: process.env.KAKAO_NATIVE_APP_KEY ?? "" }],
  ],
  extra: {
    variant: IS_PROD ? "production" : "development",
    scheme: SCHEME,
    baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? (IS_PROD ? "https://byeolkongtalk.com" : "https://dev.byeolkongtalk.com"),
    // 개발용 빌드만 — dev 사이트 Vercel 접근 보호 통과용. 운영 빌드엔 절대 넣지 않는다
    vercelBypass: IS_PROD ? null : (process.env.VERCEL_BYPASS_SECRET ?? null),
  },
};

export default config;
