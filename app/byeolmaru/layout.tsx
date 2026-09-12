import type { Metadata } from "next";

// 별마루 허브(+하위 오늘 사주·우리 오늘)는 로그인 게이트 뒤 전개인화 화면이라 noindex 유지.
// og:image 는 opengraph-image.tsx(파일 규칙)가 담당 — 여기선 공유 문구만 별마루로.
// ⚠️ openGraph 객체를 주면 루트 상속이 끊기므로 siteName·locale·type 재선언(Next 병합 규칙, lib/seo/metadata.ts 참고).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  openGraph: {
    title: "별마루 · 무료로 다 보는 곳",
    description: "오늘의 사주·타로·우리 사이 — 별콩이가 매일 짚어주는 무료 흐름.",
    siteName: "별콩톡",
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "별마루 · 무료로 다 보는 곳" },
};

export default function ByeolmaruLayout({ children }: { children: React.ReactNode }) {
  return children;
}
