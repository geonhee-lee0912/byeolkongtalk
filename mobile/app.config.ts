// 별콩톡 앱 설정 — 변형 2벌(APP_VARIANT=production | 그 밖은 development). 스펙 2026-10-12-앱-1 §4.
// 🔴 리포가 공개다: 카카오 네이티브 앱 키·Vercel 우회 값은 여기 적지 말고 EAS 환경 변수(로컬은 셸 환경 변수)로 넣는다.
import type { ExpoConfig } from "expo/config";

const IS_PROD = process.env.APP_VARIANT === "production";
const SCHEME = IS_PROD ? "byeolkong" : "byeolkong-dev";
const BUNDLE_ID = IS_PROD ? "com.byeolkongtalk.app" : "com.byeolkongtalk.app.dev";
const KAKAO_NATIVE_APP_KEY = process.env.KAKAO_NATIVE_APP_KEY ?? "";

// EAS 빌드 서버(EAS_BUILD=true — 로컬 expo config·expo start 엔 없다)에서 카카오 키가 비면 빌드를 멈춘다.
// 비어도 prebuild 는 조용히 성공하고 앱의 카카오 로그인만 죽는다
if (process.env.EAS_BUILD === "true" && !KAKAO_NATIVE_APP_KEY) {
  throw new Error("KAKAO_NATIVE_APP_KEY 가 비었다 — 이 빌드 프로필의 EAS 환경(eas.json environment)에 넣는다");
}

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
    // 웹뷰에서 이미지를 길게 눌러 '사진 앱에 저장'하면 iOS 가 이 문구를 요구한다 — 없으면 앱을 종료시킨다(Task 28 #8c)
    infoPlist: { NSPhotoLibraryAddUsageDescription: "결과 이미지를 사진에 저장할 때 사용해요" },
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
    // 안드로이드 자동 백업·기기 이전에서 보안 저장소(리프레시 토큰)를 뺀다 — 백업 범위가 shared prefs 로 좁아져 웹뷰 쿠키도 안 간다.
    // Face ID 는 쓰지 않는다(requireAuthentication 미사용) — 권한 문구를 넣지 않는다
    ["expo-secure-store", { faceIDPermission: false }],
    // 🔴 카카오 플러그인보다 앞에 둔다 — 이유는 plugins/withKakaoOpenUrl.js 머리 주석
    "./plugins/withKakaoOpenUrl.js",
    ["@react-native-seoul/kakao-login", { kakaoAppKey: KAKAO_NATIVE_APP_KEY }],
  ],
  owner: "braveshine",
  extra: {
    eas: { projectId: "57d7d377-ce97-4c95-9565-433a261df123" },
    variant: IS_PROD ? "production" : "development",
    scheme: SCHEME,
    // 주소 바꾸기(EXPO_PUBLIC_BASE_URL — 로컬 개발 서버 등)는 개발용 빌드만. 운영 빌드는 늘 운영 주소 — EAS 환경 변수를 잘못 넣어도 운영 앱이 다른 서버로 붙지 않게
    baseUrl: IS_PROD ? "https://byeolkongtalk.com" : (process.env.EXPO_PUBLIC_BASE_URL ?? "https://dev.byeolkongtalk.com"),
    // 개발용 빌드만 — dev 사이트 Vercel 접근 보호 통과용. 운영 빌드엔 절대 넣지 않는다.
    // 🔴 null 금지 — @expo/config 가 설정을 직렬화하며 null 을 {} 로 바꾼다. undefined 는 키째 빠진다(읽는 쪽 src/extra.ts 도 문자열만 받는다)
    vercelBypass: IS_PROD ? undefined : process.env.VERCEL_BYPASS_SECRET || undefined,
  },
};

export default config;
