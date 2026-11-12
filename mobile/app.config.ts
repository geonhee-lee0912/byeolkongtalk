// 별콩톡 앱 설정 — 변형 2벌(APP_VARIANT=production | 그 밖은 development). 스펙 2026-10-12-앱-1 §4.
// 🔴 리포가 공개다: 카카오 네이티브 앱 키·Vercel 우회 값은 여기 적지 말고 EAS 환경 변수(로컬은 셸 환경 변수)로 넣는다.
// 이 파일은 빌드 도구(Node)가 읽는다 — node:fs·__dirname 타입(TS 6 은 @types 를 저절로 넣지 않는다. @types/node 는 expo 가 끌어온다)
/// <reference types="node" />
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

const IS_PROD = process.env.APP_VARIANT === "production";
const SCHEME = IS_PROD ? "byeolkong" : "byeolkong-dev";
const BUNDLE_ID = IS_PROD ? "com.byeolkongtalk.app" : "com.byeolkongtalk.app.dev";
const KAKAO_NATIVE_APP_KEY = process.env.KAKAO_NATIVE_APP_KEY ?? "";
// 안드로이드 푸시(FCM) 설정 파일 — EAS 파일 환경 변수 GOOGLE_SERVICES_JSON(빌드 서버의 경로) 또는 이 폴더의 google-services.json(로컬).
// 🔴 저장소에 json 을 커밋하지 않는다(.gitignore). 둘 다 없으면 키를 아예 빼서 안드로이드는 알림만 꺼진 채 빌드·실행된다 —
// 경로를 주고 파일이 없으면 prebuild 가 멈춘다(@expo/config-plugins GoogleServices — 복사 실패 throw). 그때 토큰 등록은 push/register.ts 가 경고만 남긴다
const LOCAL_GOOGLE_SERVICES = join(__dirname, "google-services.json");
const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON || (existsSync(LOCAL_GOOGLE_SERVICES) ? "./google-services.json" : undefined);

// EAS 빌드 서버(EAS_BUILD=true — 로컬 expo config·expo start 엔 없다)에서 카카오 키가 비면 빌드를 멈춘다.
// 비어도 prebuild 는 조용히 성공하고 앱의 카카오 로그인만 죽는다
if (process.env.EAS_BUILD === "true" && !KAKAO_NATIVE_APP_KEY) {
  throw new Error("KAKAO_NATIVE_APP_KEY 가 비었다 — 이 빌드 프로필의 EAS 환경(eas.json environment)에 넣는다");
}
// 운영 안드로이드 EAS 빌드에서 FCM 파일이 없으면 빌드를 멈춘다 — 없어도 빌드는 성공하고 운영 앱의 알림만 조용히 죽는다.
// 개발용 빌드·로컬은 없어도 된다(위 GOOGLE_SERVICES_FILE). iOS 빌드는 이 파일을 쓰지 않는다 — EAS_BUILD_PLATFORM 은 EAS 가 넣는 android | ios
// (docs.expo.dev/eas/environment-variables/usage). 값이 없으면 안드로이드일 수 있다고 보고 멈춘다
if (process.env.EAS_BUILD === "true" && IS_PROD && process.env.EAS_BUILD_PLATFORM !== "ios" && !GOOGLE_SERVICES_FILE) {
  throw new Error("google-services.json 이 없다 — 운영 빌드 프로필의 EAS 환경에 파일 변수 GOOGLE_SERVICES_JSON 을 넣는다");
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
    // 별콩이 얼굴(디자인 다듬기 ②, 운영자 B안 11-09 — 캐릭터 폭은 보이는 칸의 65%, iOS icon.png 와 같은 비율)
    // 앞판은 투명 바탕 얼굴만, 뒤판은 iOS 와 같은 밤색 번짐. 둘 다 108dp 중 가운데 72dp 가 보이는 기준으로 만들었다
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundImage: "./assets/adaptive-icon-bg.png", backgroundColor: "#201238" },
    // 없으면 키째 뺀다(위 GOOGLE_SERVICES_FILE) — null 은 직렬화에서 {} 로 바뀐다(아래 extra 주석)
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  plugins: [
    // 웹뷰 첫 화면이 뜰 때까지 유지(src/WebScreen.tsx 가 hideAsync)
    // 흰 바탕 + 캐릭터 뒤 연보라 번짐 + '별콩톡'(운영자 11-09). 그림 바탕도 흰색이라 이음새가 없다. 폭 216 = 캐릭터 약 130pt(예전과 같은 크기)
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 216, resizeMode: "contain", backgroundColor: "#FFFFFF" }],
    // 카카오 SDK 안드로이드 저장소
    ["expo-build-properties", { android: { extraMavenRepos: ["https://devrepo.kakao.com/nexus/content/groups/public/"] } }],
    // 안드로이드 자동 백업·기기 이전에서 보안 저장소(리프레시 토큰)를 뺀다 — 백업 범위가 shared prefs 로 좁아져 웹뷰 쿠키도 안 간다.
    // Face ID 는 쓰지 않는다(requireAuthentication 미사용) — 권한 문구를 넣지 않는다
    ["expo-secure-store", { faceIDPermission: false }],
    // 🔴 카카오 플러그인보다 앞에 둔다 — 이유는 plugins/withKakaoOpenUrl.js 머리 주석
    "./plugins/withKakaoOpenUrl.js",
    ["@react-native-seoul/kakao-login", { kakaoAppKey: KAKAO_NATIVE_APP_KEY }],
    // 알림 — 안드로이드 상태바 아이콘(흰색·투명, 카드 두 장 + 별 — 운영자 11-12) + 색은 eye-purple(흰 알림창에서 보이는 색)
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#5A3E8C" }],
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
