import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import spreadContent from "@/data/seo/spread-content.json";
import type { EmotionTag } from "@/lib/emotions";
import { findSpreadBySlug, getAllSpreadSlugs } from "@/lib/seo/spread-slugs";
import {
  SPREAD_INFO,
  type SpreadType,
  getPositionLabels,
  getSpreadDescription,
} from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface SpreadEntry {
  whenToUse: string;
  howToRead: string;
}
const CONTENT = spreadContent as Record<string, SpreadEntry>;

/** label 이 이미 "스프레드"로 끝나는 3종(관계·재회·가능성)에서 "스프레드 스프레드" 중복을 막는다 */
const spreadTitle = (label: string) =>
  label.includes("스프레드") ? `${label} 보는 법` : `${label} 스프레드 보는 법`;

/**
 * 스프레드 → CTA 감정 태그. TAG_SPREADS(lib/tarot/spreads.ts:148) 역인덱싱 결과 —
 * 각 스프레드가 어느 태그의 시그니처 배열(그 태그 목록 index 3·4)인지로 정했다.
 * one/two/three 카드는 10개 태그 전부에 공용으로 들어가므로 중립 태그로 보낸다.
 */
const SPREAD_CTA_TAG: Record<SpreadType, EmotionTag> = {
  one_card: "그냥 별콩이한테 털어놓고 싶어",
  two_card: "그냥 별콩이한테 털어놓고 싶어",
  three_card: "그냥 별콩이한테 털어놓고 싶어",
  relationship_5: "썸, 이 관계 어떻게 될까",
  deep_feelings_5: "걔 속마음이 궁금해",
  reunion_5: "재회할 수 있을까",
  reunion_deep_7: "재회할 수 있을까",
  potential_7: "썸, 이 관계 어떻게 될까",
  checkin_6: "요즘 우리, 예전 같지 않아",
  stay_or_go_6: "요즘 우리, 예전 같지 않아",
  new_love_5: "새로운 인연, 언제쯤 올까",
  readiness_6: "새로운 인연, 언제쯤 올까",
  healing_6: "그냥 별콩이한테 털어놓고 싶어",
  chakra_7: "그냥 별콩이한테 털어놓고 싶어",
};

/** 본문이 작성된 스프레드만 발행 */
export function generateStaticParams() {
  return getAllSpreadSlugs()
    .filter((slug) => {
      const t = findSpreadBySlug(slug);
      return t !== undefined && t in CONTENT;
    })
    .map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const type = findSpreadBySlug(slug);
  if (!type || !(type in CONTENT)) return {};
  const info = SPREAD_INFO[type];
  return {
    title: `${spreadTitle(info.label)} — 타로 ${info.cardCount}장 배열`,
    description: CONTENT[type].whenToUse.slice(0, 120),
    alternates: { canonical: `/guide/spreads/${slug}` },
  };
}

export default async function SpreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const type = findSpreadBySlug(slug);
  if (!type || !(type in CONTENT)) notFound();

  const info = SPREAD_INFO[type];
  const entry = CONTENT[type];
  const labels = getPositionLabels(type, "default", null);

  return (
    <article>
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide/spreads" className="hover:text-eye-purple">
          스프레드 가이드
        </Link>
        <span className="mx-1">›</span>
        <span>{info.label}</span>
      </nav>

      <h1 className="font-display text-[21px] text-eye-purple leading-snug">
        {spreadTitle(info.label)}
      </h1>
      <p className="text-[12px] text-text-light mt-1">
        {info.cardCount}장 배열 · {getSpreadDescription(type, "default")}
      </p>

      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed mt-5">
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            언제 펼치는 배열일까
          </h2>
          <p>{entry.whenToUse}</p>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            포지션 읽는 순서
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            {labels.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <p className="mt-3">{entry.howToRead}</p>
        </div>
      </section>

      <GuideCta tag={SPREAD_CTA_TAG[type]} label="이 스프레드로 상담 받기" />
    </article>
  );
}
