// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "문의하기",
  description: "이용하다 불편했거나 궁금한 점을 별콩톡에 남겨줘.",
});

export default function SupportNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
