import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAndroidBack, iosPullEnabled, overlayAfterLoadStart } from "./ui.ts";

const BASE = "https://byeolkongtalk.com";

test("덮개 중엔 소비", () => {
  assert.equal(decideAndroidBack({ covering: true, overlayOpen: true, canGoBack: true }), "consume");
});

test("겹창이 열려 있으면 웹에 보내고 웹뷰 뒤로는 안 간다", () => {
  assert.equal(decideAndroidBack({ covering: false, overlayOpen: true, canGoBack: true }), "sendBack");
  assert.equal(decideAndroidBack({ covering: false, overlayOpen: true, canGoBack: false }), "sendBack");
});

test("겹창 없고 기록 있으면 뒤로", () => {
  assert.equal(decideAndroidBack({ covering: false, overlayOpen: false, canGoBack: true }), "goBack");
});

test("아무것도 없으면 앱 닫기", () => {
  assert.equal(decideAndroidBack({ covering: false, overlayOpen: false, canGoBack: false }), "exit");
});

test("iOS 당김 — 탭 첫 화면만, 남의 주소는 아님", () => {
  for (const u of [`${BASE}/`, `${BASE}`, `${BASE}/shop`, `${BASE}/mypage?x=1`, "https://www.byeolkongtalk.com/fortune"])
    assert.equal(iosPullEnabled(u, BASE), true, u);
  for (const u of [`${BASE}/shop/x`, `${BASE}/tarot/draw`, "https://evil.example/shop", "about:blank", ""])
    assert.equal(iosPullEnabled(u, BASE), false, u);
});

test("새 문서를 읽기 시작할 때만 겹창 상태를 닫힘으로 — 페이지 안 기록 변경(pushState 등)은 그대로", () => {
  // 안드로이드 onLoadStart 는 기록이 바뀔 때마다 온다(react-native-webview 14 doUpdateVisitedHistory). loading = progress != 100
  assert.equal(overlayAfterLoadStart(true, { loading: false }), true); // 다 읽힌 뒤 시트가 pushState — 열림 유지
  assert.equal(overlayAfterLoadStart(true, { loading: true }), false); // 새 문서 — 겹창 없음
  assert.equal(overlayAfterLoadStart(false, { loading: false }), false);
});
