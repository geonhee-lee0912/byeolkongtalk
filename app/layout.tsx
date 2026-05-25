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

export const metadata: Metadata = {
  metadataBase: new URL("https://byeolkongtalk.com"),
  title: "별콩이 — 사주로 흐름을 봐줘",
  description: "별의 수호자 별콩이가 너의 사주를 펼쳐 흐름과 가능성을 안내해.",
  openGraph: {
    title: "별콩이 — 사주로 흐름을 봐줘",
    description: "별의 수호자 별콩이가 너의 사주를 펼쳐 흐름과 가능성을 안내해.",
    locale: "ko_KR",
    type: "website",
    siteName: "별콩톡",
  },
  twitter: {
    card: "summary_large_image",
    title: "별콩이 — 사주로 흐름을 봐줘",
    description: "별의 수호자 별콩이가 너의 사주를 펼쳐 흐름과 가능성을 안내해.",
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
        <Suspense fallback={null}>
          <AuthBootstrap />
        </Suspense>
        <KakaoSdkLoader />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
