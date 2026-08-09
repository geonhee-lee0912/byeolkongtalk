// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: "별콩이의 질문",
  description: "너의 이야기를 들려주면 별콩이가 별을 줄게.",
});

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
