import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import spreadContent from "@/data/seo/spread-content.json";
import { findSpreadBySlug, getAllSpreadSlugs } from "@/lib/seo/spread-slugs";
import {
  SPREAD_INFO,
  getPositionLabels,
  getSpreadDescription,
} from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface SpreadEntry {
  whenToUse: string;
  howToRead: string;
}
const CONTENT = spreadContent as Record<string, SpreadEntry>;

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
    title: `${info.label} 스프레드 보는 법 — 타로 ${info.cardCount}장 배열`,
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
        {info.label} 스프레드 보는 법
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

      <GuideCta tag="걔 속마음이 궁금해" label="이 스프레드로 상담 받기" />
    </article>
  );
}
