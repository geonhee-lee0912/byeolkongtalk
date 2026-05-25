"use client";

import Script from "next/script";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

// 카카오 JS SDK v2 — 공유/지도/분석 등 클라이언트 기능
export default function KakaoSdkLoader() {
  if (!KAKAO_JS_KEY) return null;

  return (
    <>
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
        strategy="afterInteractive"
      />
      <Script id="kakao-sdk-init" strategy="afterInteractive">
        {`(function() {
          if (typeof window === 'undefined') return;
          var tries = 0;
          var t = setInterval(function() {
            tries++;
            if (window.Kakao && typeof window.Kakao.init === 'function') {
              if (!window.Kakao.isInitialized()) {
                try { window.Kakao.init('${KAKAO_JS_KEY}'); } catch (e) { console.warn('Kakao.init failed', e); }
              }
              clearInterval(t);
            }
            if (tries > 50) clearInterval(t);
          }, 100);
        })();`}
      </Script>
    </>
  );
}
