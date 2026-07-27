import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import { contentMetadata } from "@/lib/seo/metadata";
import { SLUG_TO_TAG, findTagBySlug } from "@/lib/seo/tags";
import { TAG_HERO } from "@/lib/seo/tag-hero";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import { SPREAD_INFO, TAG_SPREADS } from "@/lib/tarot/spreads";
import GuideCta from "@/components/seo/GuideCta";

interface TagEntry {
  title: string;
  intro: string;
  faq: { q: string; a: string }[];
}
const CONTENT = tagContent as Record<string, TagEntry>;
const SPREADS_PUBLISHED = spreadContent as Record<string, unknown>;

/** 본문이 작성된 태그만 발행 (thin page 방지 — json 에 항목 추가 = 페이지 발행) */
export function generateStaticParams() {
  return Object.keys(SLUG_TO_TAG)
    .filter((slug) => slug in CONTENT)
    .map((tag) => ({ tag }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const entry = CONTENT[tag];
  if (!entry) return {};
  return contentMetadata({
    title: entry.title,
    description: entry.intro.slice(0, 120),
    path: `/guide/themes/${tag}`,
  });
}

export default async function ThemePage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const emotionTag = findTagBySlug(tag);
  const entry = CONTENT[tag];
  if (!emotionTag || !entry) notFound();

  // 본문이 작성된 스프레드만 링크 (배치 발행 중 깨진 링크 방지)
  const spreads = TAG_SPREADS[emotionTag].filter(
    (s) => s in SPREADS_PUBLISHED
  );
  const hero = TAG_HERO[tag];

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
            "@type": "FAQPage",
            mainEntity: entry.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <nav className="text-[11px] text-text-light mb-3">
        <Link href="/guide" className="hover:text-eye-purple">
          별콩이의 타로 가이드
        </Link>
        <span className="mx-1">›</span>
        <span>{entry.title.split("—")[0].trim()}</span>
      </nav>

      {hero && (
        <div
          className={[
            "relative w-full aspect-[4/3] rounded-2xl overflow-hidden mb-4",
            // 재활용 PNG 6종은 투명 배경이라 그냥 두면 떠 보인다
            // → 배경이 구워진 신규 WebP 4종과 톤을 맞추려고 CSS 그라데이션을 깐다
            hero.hasBackground
              ? null
              : "bg-gradient-to-b from-lilac-soft to-lilac",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* 장식 이미지 — 주제·정보는 h1 과 intro 가 전달하므로 alt 는 빈 문자열 */}
          {/* priority 없음 — 첫 화면 LCP 는 h1 텍스트가 잡게 둔다(Core Web Vitals) */}
          <Image
            src={hero.src}
            alt=""
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className={hero.hasBackground ? "object-cover" : "object-contain"}
          />
        </div>
      )}

      <h1 className="font-display text-[21px] text-eye-purple leading-snug">
        {entry.title}
      </h1>
      <p className="text-[13.5px] text-eye-purple/90 leading-relaxed mt-4">
        {entry.intro}
      </p>

      {spreads.length > 0 && (
        <>
          <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">
            이 고민에 맞는 스프레드
          </h2>
          <div className="flex flex-col gap-2">
            {spreads.map((s) => (
              <Link
                key={s}
                href={`/guide/spreads/${buildSpreadSlug(s)}`}
                className="text-[13px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-xl px-3.5 py-2.5 hover:border-lilac-deep/40 transition"
              >
                {SPREAD_INFO[s].label} ({SPREAD_INFO[s].cardCount}장) ›
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="text-[15px] font-bold text-eye-purple mt-6 mb-2">
        자주 묻는 질문
      </h2>
      <div className="space-y-3">
        {entry.faq.map((f) => (
          <div key={f.q}>
            <p className="text-[13px] font-bold text-eye-purple">Q. {f.q}</p>
            <p className="text-[13px] text-eye-purple/90 leading-relaxed mt-1">
              {f.a}
            </p>
          </div>
        ))}
      </div>

      <GuideCta tag={emotionTag} label="이 고민 별콩이한테 물어보기" />
    </article>
  );
}
