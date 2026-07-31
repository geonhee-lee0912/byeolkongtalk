// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "사주 고민 적기",
  description: "뽑힌 사주를 확인하고 별콩이에게 물어볼 고민을 적어줘.",
});

export default function SajuConcernLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
