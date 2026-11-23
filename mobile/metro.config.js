// 앱 번들러 설정 — 루트의 웹↔앱 공용 약속(lib/app-bridge)만 앱 밖에서 가져온다. 스펙 2026-10-12-앱-1 §3.
// 그 폴더 파일은 아무것도 import 하지 않아(lib/app-bridge/protocol.ts) 루트 node_modules 를 찾을 일이 없다.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../lib/app-bridge")];

module.exports = config;
