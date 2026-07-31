// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "사주 결과",
  description: "별콩이와 나눈 사주 상담을 한눈에 정리한 결과야.",
});

export default function SajuResultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
