// 안드로이드 FCM 자동 등록을 끈다(운영자 2026-11-22 알림-4B). 기본값은 켜짐 — 앱이 처음 켜질 때 로그인·알림 허용과 상관없이
// Google 에 기기를 등록한다. 꺼도 push/register.ts 의 getExpoPushTokenAsync 는 토큰을 받는다(FirebaseMessaging.getToken 은 이 값을 안 본다).
// 🔴 지우면 개인정보처리방침의 'Google 로 보내는 때'가 사실이 아니게 된다.
// expo 는 함수 안에서 부른다 — 루트 CI 엔 mobile/node_modules 가 없다(src/fcmAutoInit.test.ts).
const KEY = "firebase_messaging_auto_init_enabled";

function turnOffAutoInit(application) {
  application["meta-data"] = [
    ...(application["meta-data"] ?? []).filter((item) => item.$["android:name"] !== KEY),
    { $: { "android:name": KEY, "android:value": "false" } },
  ];
}

module.exports = (config) => {
  const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");
  return withAndroidManifest(config, (cfg) => {
    turnOffAutoInit(AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults));
    return cfg;
  });
};
module.exports.turnOffAutoInit = turnOffAutoInit;
