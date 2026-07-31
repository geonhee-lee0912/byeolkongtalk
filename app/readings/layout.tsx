// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "보관함",
  description: "별콩이와 나눈 상담과 운세 리포트를 다시 볼 수 있어.",
});

export default function ReadingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
