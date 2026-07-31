// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "결제·별 내역",
  description: "결제 내역과 별을 충전·사용한 기록을 볼 수 있어.",
});

export default function MypagePaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
