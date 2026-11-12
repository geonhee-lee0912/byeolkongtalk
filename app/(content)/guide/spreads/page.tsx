import Link from "next/link";
import spreadContent from "@/data/seo/spread-content.json";
import { contentMetadata } from "@/lib/seo/metadata";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

// SPREAD_INFO 에 등록된 실제 스프레드 종수 — 제목의 "n가지"가 이 값에 묶여 있어
// 스프레드가 추가/제거돼도 문구가 거짓말이 되지 않는다
const SPREAD_COUNT = Object.keys(SPREAD_INFO).length;

export const metadata = contentMetadata({
  title: `타로 스프레드 종류 ${SPREAD_COUNT}가지 — 원카드부터 7장 심층 배열까지`,
  description: `원카드·투카드·쓰리카드부터 7장 심층 배열까지, 타로 스프레드(배열법) ${SPREAD_COUNT}가지를 언제 펼치고 어떤 순서로 읽는지 별콩이가 정리했어.`,
  path: "/guide/spreads",
});

const CONTENT = spreadContent as Record<string, unknown>;

export default function SpreadsIndex() {
  const published = (Object.keys(SPREAD_INFO) as SpreadType[])
    .filter((t) => t in CONTENT)
    .sort((a, b) => SPREAD_INFO[a].cardCount - SPREAD_INFO[b].cardCount);

  return (
    <div>
      <h1 className="font-display text-22 text-eye-purple">
        타로 스프레드 종류 {SPREAD_COUNT}가지
      </h1>
      <p className="text-13 text-text-light mt-1.5 leading-relaxed">
        몇 장을 펼치느냐에 따라 보이는 게 달라져 — 배열별로 언제 쓰는지
        정리해뒀어.
      </p>
      <div className="h-px bg-lilac-mid/40 mt-4 mb-4" aria-hidden />
      <div className="flex flex-col gap-2.5">
        {published.map((t) => (
          <Link
            key={t}
            href={`/guide/spreads/${buildSpreadSlug(t)}`}
            className="card transition"
          >
            <p className="text-14 font-bold text-eye-purple">
              {SPREAD_INFO[t].label}{" "}
              <span className="text-12 font-normal text-text-light">
                {SPREAD_INFO[t].cardCount}장
              </span>
            </p>
            <p className="text-12 text-text-light mt-0.5 leading-snug">
              {SPREAD_INFO[t].tagline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
