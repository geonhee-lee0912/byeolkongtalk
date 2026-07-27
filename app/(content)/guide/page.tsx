import Image from "next/image";
import Link from "next/link";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import cardContent from "@/data/seo/card-content.json";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata = contentMetadata({
  title: "별콩이의 타로 가이드 — 고민별 타로·스프레드·무료 카드",
  description:
    "재회·짝사랑·썸 같은 고민별 타로 가이드와 스프레드 보는 법을 별콩이가 정리했어. 오늘의 카드는 가입 없이 무료.",
  path: "/guide",
});

const THEMES = tagContent as Record<string, { title: string }>;
const SPREADS = spreadContent as Record<string, unknown>;
const CARDS = cardContent as Record<string, unknown>;

export default function GuideHome() {
  const hubs = [
    {
      href: "/free/daily-card",
      title: "오늘의 카드",
      desc: "가입 없이 한 장, 무료",
      show: true,
    },
    {
      href: "/guide/spreads",
      title: "스프레드 가이드",
      desc: "배열별로 언제·어떻게 보는지",
      show: Object.keys(SPREADS).length > 0,
    },
    {
      href: "/guide/tarot-cards",
      title: "타로 카드 도감",
      desc: "78장의 의미, 연애 맥락으로",
      show: Object.keys(CARDS).length > 0,
    },
  ].filter((h) => h.show);

  return (
    <div>
      {/* 히어로 — 콘텐츠 존의 얼굴. 장식이므로 alt=""(정보는 h1·본문이 전달) */}
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden mb-4">
        <Image
          src="/guide-hub-hero.webp"
          alt=""
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          aria-hidden
        />
      </div>

      <h1 className="font-display text-[22px] text-eye-purple">
        별콩이의 타로 가이드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        카드가 처음이어도 괜찮아 — 고민별로 무엇을 어떻게 보는지 차근차근
        정리해뒀어.
      </p>

      <div className="flex flex-col gap-2.5 mt-5">
        {hubs.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <p className="text-[14px] font-bold text-eye-purple">{h.title}</p>
            <p className="text-[11.5px] text-text-light mt-0.5">{h.desc}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-[14px] font-bold text-eye-purple mt-6 mb-2">
        고민별 타로 가이드
      </h2>
      <div className="flex flex-col gap-2.5">
        {Object.entries(THEMES).map(([slug, t]) => (
          <Link
            key={slug}
            href={`/guide/themes/${slug}`}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <p className="text-[14px] font-bold text-eye-purple">
              {t.title.split("—")[0].trim()}
            </p>
            <p className="text-[11.5px] text-text-light mt-0.5">
              {t.title.split("—")[1].trim()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
