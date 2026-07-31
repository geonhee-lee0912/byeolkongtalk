// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "고민 적기",
  description: "지금 마음에 걸리는 걸 골라서 적어줘. 별콩이가 그 결에 맞춰 카드를 준비할게.",
});

export default function ConcernLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
