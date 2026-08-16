import type { Metadata } from "next";

// 개인 별자리는 공유 전용 — 색인 금지(스펙 §9·§10 프라이버시). 만들기 페이지는 색인 유지.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ByeoljariShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
