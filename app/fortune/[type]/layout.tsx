// 메타데이터 전용 레이아웃 — 렌더 결과는 children 그대로.
// monthly·saju_full·good_days 등 사주 기반 운세 입력 화면을 모두 받는 동적 세그먼트라
// 문구는 FORTUNE_CONFIG 에서 꺼낸다. 알 수 없는 type 은 페이지가 /fortune 으로
// 되돌리므로 여기서는 상위(/fortune) 문구를 그대로 쓰는 폴백만 둔다.
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { noindexMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const cfg = type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type as FortuneType] : null;
  return noindexMetadata({
    title: cfg?.label ?? "별콩 운세",
    description:
      cfg?.tagline ?? "별콩이가 사주로 흐름을 짚어 리포트 한 장으로 정리해줄게.",
  });
}

export default function FortuneTypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
