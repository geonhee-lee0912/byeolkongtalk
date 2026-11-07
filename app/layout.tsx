import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import AuthBootstrap from "@/components/auth/AuthBootstrap";
import KakaoSdkLoader from "@/components/auth/KakaoSdkLoader";
import AppShell from "@/components/layout/AppShell";
import { appModeScript } from "@/lib/app-shell/mode";
import MetaPixel from "@/components/analytics/MetaPixel";
import PageViewBeacon from "@/components/analytics/PageViewBeacon";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const cafe24Ssurround = localFont({
  src: "../public/fonts/Cafe24Ssurround.otf",
  variable: "--font-cafe24",
  display: "swap",
});

const verification: Metadata["verification"] = {};
if (process.env.GOOGLE_SITE_VERIFICATION) {
  verification.google = process.env.GOOGLE_SITE_VERIFICATION;
}
// 메타(페이스북) 도메인 인증 — 페이지 소스에 공개 노출되는 값이라 하드코딩 (비밀 아님)
const otherVerification: Record<string, string> = {
  "facebook-domain-verification": "a41fr6o1ai92wldbrg6u9cztb0zm0y",
};
if (process.env.NAVER_SITE_VERIFICATION) {
  otherVerification["naver-site-verification"] =
    process.env.NAVER_SITE_VERIFICATION;
}
verification.other = otherVerification;

export const metadata: Metadata = {
  metadataBase: new URL("https://byeolkongtalk.com"),
  title: {
    default: "별콩톡 — 사주·타로로 마음의 흐름을 봐줘",
    template: "%s · 별콩톡",
  },
  description:
    "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성, 선택의 방향을 안내해.",
  alternates: { canonical: "/" },
  verification,
  openGraph: {
    title: "별콩이 — 사주·타로로 흐름을 봐줘",
    description:
      "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성을 안내해.",
    locale: "ko_KR",
    type: "website",
    siteName: "별콩톡",
  },
  twitter: {
    card: "summary_large_image",
    title: "별콩이 — 사주·타로로 흐름을 봐줘",
    description:
      "별의 수호자 별콩이가 너의 사주와 타로로 흐름과 가능성을 안내해.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF6F0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning — <body> 첫 스크립트(appModeScript)가 하이드레이션 전에 data-app·data-platform 을 붙인다
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${notoSansKR.variable} ${cafe24Ssurround.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 앱 모드 표시 — AppShell 보다 앞이어야 헤더가 그려지기 전에 실행된다(스펙 2026-11-07-앱-화면 §3) */}
        <script dangerouslySetInnerHTML={{ __html: appModeScript() }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "별콩톡",
                url: "https://byeolkongtalk.com",
                logo: "https://byeolkongtalk.com/byeolkong-main.png",
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "별콩톡",
                url: "https://byeolkongtalk.com",
              },
            ]),
          }}
        />
        <Suspense fallback={null}>
          <AuthBootstrap />
        </Suspense>
        <KakaoSdkLoader />
        <MetaPixel />
        <Suspense fallback={null}>
          <PageViewBeacon />
        </Suspense>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
