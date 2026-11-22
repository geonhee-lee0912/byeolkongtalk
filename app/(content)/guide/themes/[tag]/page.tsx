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
import Icon from "@/components/common/Icon";

interface TagEntry {
  title: string;
  intro: string;
  faq: { q: string; a: string }[];
}
const CONTENT = tagContent as Record<string, TagEntry>;
const SPREADS_PUBLISHED = spreadContent as Record<string, unknown>;
// design-allow: 그림 양끝을 풀어 주는 가림막(색 아님)
const HERO_EDGE = "linear-gradient(to right, transparent, black 5%, black 95%, transparent)";

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
      <nav className="text-11 text-text-light mb-3">
        <Link href="/guide" className="hover:text-eye-purple">
          별콩이의 타로 가이드
        </Link>
        <span className="mx-1"><Icon name="chev_r" size={16} /></span>
        <span>{entry.title.split("—")[0].trim()}</span>
      </nav>

      {hero && (
        // 낮은 배너(가이드 첫 화면 H3 와 같은 모양, 디자인 다듬기 묶음 9 A) — 그림은 자르지 않고,
        // 투명 PNG 6종은 그냥 두면 떠 보여서 연보라 바탕을 깐다
        <div
          className={`w-full aspect-[21/10] rounded-2xl overflow-hidden mb-4 ${hero.bg ? "" : "bg-lilac-soft"}`}
          style={{ background: hero.bg }}
        >
          <div
            className={`relative h-full ${hero.bg ? "aspect-[900/672] mx-auto" : ""}`}
            style={hero.bg ? { maskImage: HERO_EDGE, WebkitMaskImage: HERO_EDGE } : undefined}
          >
            {/* 장식 이미지 — 주제·정보는 h1 과 intro 가 전달하므로 alt 는 빈 문자열 */}
            {/* priority 없음 — 첫 화면 LCP 는 h1 텍스트가 잡게 둔다(Core Web Vitals) */}
            <Image
              src={hero.src}
              alt=""
              fill
              sizes="(max-width: 448px) 64vw, 288px"
              className="object-contain"
            />
          </div>
        </div>
      )}

      <h1 className="font-display text-22 text-eye-purple leading-snug break-keep text-pretty">
        {entry.title}
      </h1>
      <p className="text-14 text-eye-purple/90 leading-relaxed mt-4">
        {entry.intro}
      </p>

      {spreads.length > 0 && (
        <>
          <h2 className="text-15 font-bold text-eye-purple mt-6 mb-2">
            이 고민에 맞는 스프레드
          </h2>
          {/* 큰 버튼 다섯 → 한 카드 목록(디자인 다듬기 묶음 9 ⑤ T1, 운영자 11-22) — 카드 그림은 타로 고르기(SpreadPicker)와 같은 밤 뒷면을 작게 */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden divide-y divide-lilac-mid/25">
            {spreads.map((s) => {
              const info = SPREAD_INFO[s];
              // 일곱 장도 58px 칸에 들어가게 많을수록 더 겹친다
              const overlap = info.cardCount > 5 ? -16 : -13;
              return (
                <Link key={s} href={`/guide/spreads/${buildSpreadSlug(s)}`} className="flex items-center gap-3 px-3.5 py-3">
                  <span className="flex w-[58px] shrink-0 items-center justify-center" aria-hidden>
                    {Array.from({ length: info.cardCount }, (_, i) => (
                      <span
                        key={i}
                        className="flex h-[33px] w-[22px] shrink-0 items-center justify-center rounded-sm border border-gold bg-night ring-1 ring-white"
                        style={{ transform: `rotate(${(i - (info.cardCount - 1) / 2) * 6}deg)`, marginLeft: i ? overlap : 0 }}
                      >
                        <Icon name="sparkle" size={9} className="text-gold" />
                      </span>
                    ))}
                  </span>
                  <span className="flex-1 min-w-0 break-keep">
                    <span className="block text-14 font-bold text-eye-purple">
                      {info.label} <span className="text-12 leading-[21px] font-normal text-text-light whitespace-nowrap">{info.cardCount}장</span>
                    </span>
                    <span className="block text-12 text-text-light">{info.tagline}</span>
                  </span>
                  <Icon name="chev_r" size={16} className="text-text-light" />
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className="text-15 font-bold text-eye-purple mt-6 mb-2">
        자주 묻는 질문
      </h2>
      <div className="space-y-3">
        {entry.faq.map((f) => (
          <div key={f.q}>
            <p className="text-13 font-bold text-eye-purple">Q. {f.q}</p>
            <p className="text-13 text-eye-purple/90 leading-relaxed mt-1">
              {f.a}
            </p>
          </div>
        ))}
      </div>

      <GuideCta tag={emotionTag} label="이 고민 별콩이한테 물어보기" />
    </article>
  );
}
