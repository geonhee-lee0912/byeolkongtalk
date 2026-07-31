// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "별콩 상점",
  description: "상담과 운세에 쓰는 별을 충전하는 곳이야.",
});

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
