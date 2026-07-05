"use client";

import Script from "next/script";

/** Meta Pixel — PageView 자동 추적. 표준 전환 이벤트(가입/구매)는 서버 CAPI에서 전송(중복 방지 분담).
 *  NEXT_PUBLIC_META_PIXEL_ID 는 빌드 시 인라인되는 값 — env 변경 후엔 소스 변경(캐시 무효화)으로 재빌드해야 반영됨. */
export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
    </Script>
  );
}
