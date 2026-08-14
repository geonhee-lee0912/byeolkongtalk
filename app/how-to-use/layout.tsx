// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "별콩이 사용 방법",
  description: "별콩이랑 어떻게 노는지 알려줄게.",
});

export default function HowToUseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
