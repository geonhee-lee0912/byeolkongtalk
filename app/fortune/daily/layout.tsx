// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// 문구는 FORTUNE_CONFIG 를 그대로 읽는다(진열대 라벨과 <head> 가 갈리지 않게).
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata({
  title: FORTUNE_CONFIG.daily.label,
  description: FORTUNE_CONFIG.daily.tagline,
});

export default function FortuneDailyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
