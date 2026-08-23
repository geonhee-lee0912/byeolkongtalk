import type { Metadata } from "next";

// 개인 별자리는 공유 전용 — 색인 금지(스펙 §9·§10 프라이버시). 만들기 페이지는 색인 유지.
// og:image 는 opengraph-image.tsx(파일 규칙)가 담당 — 여기선 제목/설명만 별자리로.
// ⚠️ openGraph 객체를 주면 루트 상속이 끊기므로 siteName·locale·type 재선언(Next 병합 규칙).
const SHARE_TITLE = "우리 인연 별자리 · 별콩톡";
const SHARE_DESC = "생일만 넣으면 친구들과의 사주 인연이 별자리로 이어져. 별콩이가 그려주는 우리 인연 별자리.";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: SHARE_TITLE,
  description: SHARE_DESC,
  openGraph: {
    title: SHARE_TITLE,
    description: SHARE_DESC,
    siteName: "별콩톡",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESC,
  },
};

export default function ByeoljariShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
