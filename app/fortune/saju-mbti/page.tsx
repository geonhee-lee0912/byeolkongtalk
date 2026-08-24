import type { Metadata } from "next";
import { decodeResult } from "@/lib/saju-mbti/share-tokens";
import { TYPE_CONTENT } from "@/lib/saju-mbti/content";
import { noindexMetadata } from "@/lib/seo/metadata";
import { SajuMbtiFlow } from "@/components/saju-mbti/SajuMbtiFlow";

function firstParam(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// ⚠️ 공유 결과는 noindex + per-result OG. contentMetadata(정적 OG 강제)·noindexMetadata(OG 생략)
// 둘 다 안 맞아 직접 선언한다. Next 는 openGraph 를 통째로 교체하므로 siteName·locale·type·images
// 를 전부 포함(빼면 루트 값 소실). 이미지는 상대경로(루트 metadataBase 가 절대화, OG_IMAGE 와 동일).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const r = firstParam(sp.r);
  const decoded = decodeResult(r);
  if (decoded && r) {
    const content = TYPE_CONTENT[decoded.paljaCode];
    const title = `나 ${content?.character ?? "사주 MBTI"}래, 넌?`;
    const description = content?.oneLiner ?? "사주로 보는 나의 성격 유형";
    const image = { url: `/api/og/saju-mbti?r=${r}`, width: 1200, height: 630, type: "image/png" as const };
    return {
      title,
      description,
      robots: { index: false, follow: false },
      alternates: { canonical: null },
      openGraph: { title, description, url: `/fortune/saju-mbti?r=${r}`, siteName: "별콩톡", locale: "ko_KR", type: "website", images: [image] },
      twitter: { card: "summary_large_image", title, description, images: [image] },
    };
  }
  return noindexMetadata({
    title: "사주 MBTI",
    description: "네가 아는 너 vs 타고난 너 — 사주로 보는 조선 전래 성격 유형 테스트",
  });
}

export default async function SajuMbtiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-cream">
      <SajuMbtiFlow sharedToken={firstParam(sp.r)} />
    </main>
  );
}
