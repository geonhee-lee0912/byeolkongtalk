import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import cardContent from "@/data/seo/card-content.json";
import { contentMetadata } from "@/lib/seo/metadata";
import {
  findCardBySlug,
  buildCardSlug,
  getAllCardSlugs,
} from "@/lib/seo/tarot-slugs";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import GuideCta from "@/components/seo/GuideCta";

interface CardEntry {
  intro: string;
  uprightLove: string;
  reversedLove: string;
  advice: string;
  oneLiner: string;
}
const CONTENT = cardContent as Record<string, CardEntry>;

/** 본문이 작성된 카드만 발행 (1차에는 0장) */
export function generateStaticParams() {
  return getAllCardSlugs()
    .filter((slug) => slug in CONTENT)
    .map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = findCardBySlug(slug);
  const entry = CONTENT[slug];
  if (!card || !entry) return {};
  return contentMetadata({
    title: `${card.name_kr} 카드 의미 — 정방향·역방향 연애 타로`,
    description: `${entry.oneLiner} ${entry.intro.slice(0, 90)}`,
    path: `/guide/tarot-cards/${slug}`,
  });
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = findCardBySlug(slug);
  const entry = CONTENT[slug];
  if (!card || !entry) notFound();

  const prev = getCard(card.id - 1);
  const next = getCard(card.id + 1);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // 본문 json 은 LLM 초안이 들어오는 경로다. 여는 꺾쇠를 유니코드 이스케이프로
          // 바꿔서 본문에 섞인 스크립트 종료 태그가 이 블록을 조기 종료시키지 못하게 막는다.
          // JSON 파서가 이스케이프를 원래 문자로 되돌리므로 JSON-LD 유효성에는 영향이 없다.
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${card.name_kr} 카드 의미 — 정방향·역방향`,
            author: { "@type": "Organization", name: "별콩톡" },
            image: `https://byeolkongtalk.com${getCardImagePath(card.id)}`,
          }).replace(/</g, "\\u003c"),
        }}
      />
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide/tarot-cards" className="hover:text-eye-purple">
          타로 카드 도감
        </Link>
        <span className="mx-1">›</span>
        <span>{card.name_kr}</span>
      </nav>

      <h1 className="font-display text-[22px] text-eye-purple leading-snug">
        {card.name_kr} 카드 의미
      </h1>
      <p className="text-[12px] text-text-light mt-1">
        정방향 · 역방향 · 연애 타로 해석
      </p>

      <div className="relative w-[140px] h-[238px] mx-auto my-5 rounded-xl overflow-hidden shadow-md">
        <Image
          src={getCardImagePath(card.id)}
          alt={`${card.name_kr} 타로 카드`}
          fill
          sizes="140px"
          className="object-cover"
        />
      </div>

      <section className="space-y-5 text-[13.5px] text-eye-purple/90 leading-relaxed">
        <p>{entry.intro}</p>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            정방향 — 연애에서는
          </h2>
          <p>{entry.uprightLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.upright.map((k) => (
              <span
                key={k}
                className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
              >
                #{k}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            역방향 — 연애에서는
          </h2>
          <p>{entry.reversedLove}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {card.reversed.map((k) => (
              <span
                key={k}
                className="text-[11px] font-bold text-text-light bg-cream-warm px-2 py-0.5 rounded-full border border-lilac-soft"
              >
                #{k}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-eye-purple mb-1.5">
            별콩이의 한마디
          </h2>
          <p>{entry.advice}</p>
        </div>
      </section>

      <GuideCta tag="걔 속마음이 궁금해" />

      <nav className="flex justify-between mt-6 text-[12px] text-lilac-deep font-bold">
        {prev && buildCardSlug(prev) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(prev)}`}>
            ‹ {prev.name_kr}
          </Link>
        ) : (
          <span />
        )}
        {next && buildCardSlug(next) in CONTENT ? (
          <Link href={`/guide/tarot-cards/${buildCardSlug(next)}`}>
            {next.name_kr} ›
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
