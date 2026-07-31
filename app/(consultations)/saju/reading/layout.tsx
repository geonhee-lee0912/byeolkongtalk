// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "사주 풀이",
  description: "네 사주를 바탕으로 별콩이가 고민을 풀어주는 중이야.",
});

export default function SajuReadingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
