// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "문의 상세",
  description: "남긴 문의 하나와 그에 대한 별콩톡의 답변이야.",
});

export default function SupportDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
