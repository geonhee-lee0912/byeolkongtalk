// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "타로 풀이",
  description: "네가 뽑은 카드를 별콩이가 한 장씩 풀어주는 중이야.",
});

export default function TarotReadingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
