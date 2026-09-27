import type { Metadata } from "next";
import { decodeResult } from "@/lib/saju-mbti/share-tokens";
import { TYPE_CONTENT, shareHook } from "@/lib/saju-mbti/content";
import { noindexMetadata, productMetadata } from "@/lib/seo/metadata";
import { SajuMbtiFlow } from "@/components/saju-mbti/SajuMbtiFlow";
import SajuMbtiResume from "@/components/saju-mbti/SajuMbtiResume";
import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import { fortuneOutline } from "@/lib/fortune/outline";
import { FORTUNE_LANDING } from "@/data/fortune/landing";

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
    const title = content ? shareHook(content.character) : "사주 MBTI";
    const description = (content?.oneLiner ?? "사주로 보는 나의 성격 유형").replace(/\n/g, " ");
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
  const started = firstParam(sp.start);
  if (started) {
    return noindexMetadata({
      title: "사주 MBTI",
      description: "네가 아는 너 vs 타고난 너 — 사주로 보는 조선 전래 성격 유형 테스트",
    });
  }
  return productMetadata({
    title: "사주 MBTI",
    description: FORTUNE_LANDING.saju_mbti.hook.replace(/\n/g, " "),
    path: "/fortune/saju-mbti",
  });
}

export default async function SajuMbtiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const shared = firstParam(sp.r);
  const started = firstParam(sp.start);

  // 공유 결과·진행 중 플로우는 기존 경로 그대로.
  if (shared || started) {
    return (
      <main className="min-h-[calc(100dvh-8rem)]">
        <SajuMbtiFlow sharedToken={shared} skipIntro={!shared && !!started} />
      </main>
    );
  }

  const copy = FORTUNE_LANDING.saju_mbti;
  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <SajuMbtiResume />
      <FortuneLandingHero
        title="사주 MBTI"
        hook={copy.hook}
        heroSrc="/byeolkong-main.png"
        chips={["무료", "12문항", copy.minutes]}
        ctaLabel="테스트 시작하기"
        ctaHref="/fortune/saju-mbti?start=1"
        trackType="saju_mbti"
      />
      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline("saju_mbti")}
        sample={copy.sample}
        samplePreview={null}
        related={copy.related ?? []}
      />
    </main>
  );
}
