import type { Metadata } from "next";
import Image from "next/image";
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

/**
 * 스프레드별 별콩이 삽화 — 결정론적 선택.
 * 이 라우트는 generateStaticParams + dynamicParams=false 로 빌드 타임 정적 생성이라
 * 매 로드 랜덤은 클라이언트 JS 가 필요하고 하이드레이션 불일치·레이아웃 시프트를 만든다.
 * SpreadType 문자열 해시로 재활용 투명 PNG 6종 중 하나를 고정 배정해 14페이지가
 * 서로 다른 포즈를 갖게 한다(SPREAD_INFO 선언 순서를 그대로 mod 하면 인접 스프레드가
 * 같은 이미지로 몰릴 수 있어 해시로 흩뜨린다). shop(충전 유도)·saju(사주 맥락)·
 * main/hero(브랜드 대표컷)는 이 맥락에 안 맞아 제외.
 */
const SPREAD_POSES = [
  "/byeolkong-tarot.png",
  "/byeolkong-focus.png",
  "/byeolkong-curious.png",
  "/byeolkong-listen.png",
  "/byeolkong-joy.png",
  "/byeolkong-cheer.png",
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

const poseForSpread = (type: SpreadType) =>
  SPREAD_POSES[hashString(type) % SPREAD_POSES.length];

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

      {/* 중간 삽화 — 페이지의 얼굴(히어로)이 아니라 본문 사이 장식이라 태그 랜딩 히어로보다
          작게 둔다. 투명 PNG 라 태그 랜딩(hasBackground:false) 과 동일하게 라일락
          그라데이션 컨테이너 + object-contain 로 감싼다. */}
      <div className="relative w-36 h-36 mx-auto my-8 rounded-2xl overflow-hidden bg-gradient-to-b from-lilac-soft to-lilac">
        <Image
          src={poseForSpread(type)}
          alt=""
          fill
          sizes="144px"
          className="object-contain"
          aria-hidden
        />
      </div>

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
