// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "타로 카드 뽑기",
  description: "마음을 가라앉히고 카드를 골라줘. 뽑은 카드로 별콩이가 풀이를 시작할게.",
});

export default function TarotDrawLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
