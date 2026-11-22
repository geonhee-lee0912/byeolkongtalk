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

// 히어로 그림(900×672)엔 위→아래 바탕색이 구워져 있다 — 원본 가장자리 색을 10% 높이마다 잰 값으로 좌우를 잇고,
// 그림 양끝(글자·캐릭터 없는 14%)만 풀어 경계를 숨긴다. 그림을 바꾸면 이 값도 다시 잴 것.
// design-allow: 그림에 구워진 바탕을 좌우로 잇는 색(장식 그라데이션 아님)
const HERO_BG = "linear-gradient(to bottom, rgb(244 231 253) 0%, rgb(243 232 253) 10%, rgb(241 229 251) 20%, rgb(238 227 250) 30%, rgb(236 223 248) 40%, rgb(231 218 243) 50%, rgb(229 215 240) 60%, rgb(225 208 238) 70%, rgb(220 204 236) 80%, rgb(217 203 235) 90%, rgb(215 200 231) 100%)";
// design-allow: 그림 양끝을 풀어 주는 가림막(색 아님)
const HERO_EDGE = "linear-gradient(to right, transparent, black 14%, black 86%, transparent)";

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
      {/* 히어로 — 콘텐츠 존의 얼굴. 장식이므로 alt=""(정보는 h1·본문이 전달).
          화면 절반이던 4:3 → 낮은 배너, 그림은 자르지 않고 정비율로 줄여 가운데(디자인 다듬기 묶음 9 ③ H3, 운영자 11-22) */}
      <div className="w-full aspect-[21/10] rounded-2xl overflow-hidden mb-4" style={{ background: HERO_BG }}>
        <div
          className="relative h-full aspect-[900/672] mx-auto"
          style={{ maskImage: HERO_EDGE, WebkitMaskImage: HERO_EDGE }}
        >
          <Image
            src="/guide-hub-hero.webp"
            alt=""
            fill
            sizes="(max-width: 448px) 64vw, 288px"
            className="object-contain"
            aria-hidden
          />
        </div>
      </div>

      {/* 앱에선 앱 머리 '타로 가이드'와 두 번이라 숨긴다(web-only) — 웹·검색엔 h1 그대로 */}
      <h1 className="web-only mb-1.5 font-display text-22 text-eye-purple">
        별콩이의 타로 가이드
      </h1>
      <p className="text-13 text-text-light leading-relaxed break-keep">
        카드가 처음이어도 괜찮아 — 고민별로 무엇을 어떻게 보는지 차근차근
        정리해뒀어.
      </p>

      <div className="flex flex-col gap-2.5 mt-5">
        {hubs.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="card transition"
          >
            <p className="text-14 font-bold text-eye-purple">{h.title}</p>
            <p className="text-12 text-text-light mt-0.5">{h.desc}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-15 font-bold text-eye-purple mt-6 mb-3">
        고민별 타로 가이드
      </h2>
      <div className="flex flex-col gap-2.5">
        {Object.entries(THEMES).map(([slug, t]) => (
          <Link
            key={slug}
            href={`/guide/themes/${slug}`}
            className="card transition"
          >
            <p className="text-14 font-bold text-eye-purple">
              {t.title.split("—")[0].trim()}
            </p>
            <p className="text-12 text-text-light mt-0.5">
              {t.title.split("—")[1].trim()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
