// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// 광고 전용 랜딩(유효 variant 없이 들어오면 홈으로). app/robots.ts 의 disallow
// 목록에 없어서 이 noindex 가 실제로 크롤러 눈에 닿는 몇 안 되는 화면이다.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "시작하기",
  description: "별콩이와 무엇부터 이야기할지 고르는 시작 화면이야.",
});

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
