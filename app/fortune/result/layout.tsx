// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "운세 리포트",
  description: "별콩이가 한 장으로 정리해준 운세 리포트야.",
});

export default function FortuneResultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
