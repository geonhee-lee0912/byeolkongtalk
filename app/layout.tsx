import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import AuthBootstrap from "@/components/auth/AuthBootstrap";
import KakaoSdkLoader from "@/components/auth/KakaoSdkLoader";
import AppShell from "@/components/layout/AppShell";
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
if (process.env.NAVER_SITE_VERIFICATION) {
  verification.other = {
    "naver-site-verification": process.env.NAVER_SITE_VERIFICATION,
  };
}

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
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${cafe24Ssurround.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
