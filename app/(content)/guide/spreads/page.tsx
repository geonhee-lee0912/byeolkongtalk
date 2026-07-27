import type { Metadata } from "next";
import Link from "next/link";
import spreadContent from "@/data/seo/spread-content.json";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export const metadata: Metadata = {
  title: "타로 스프레드 가이드 — 배열별로 언제·어떻게 보는지",
  description:
    "원카드부터 7장 심층 배열까지, 각 스프레드를 언제 펼치고 어떤 순서로 읽는지 별콩이가 정리했어.",
  alternates: { canonical: "/guide/spreads" },
};

const CONTENT = spreadContent as Record<string, unknown>;

export default function SpreadsIndex() {
  const published = (Object.keys(SPREAD_INFO) as SpreadType[])
    .filter((t) => t in CONTENT)
    .sort((a, b) => SPREAD_INFO[a].cardCount - SPREAD_INFO[b].cardCount);

  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">
        타로 스프레드 가이드
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        몇 장을 펼치느냐에 따라 보이는 게 달라져 — 배열별로 언제 쓰는지
        정리해뒀어.
      </p>
      <div className="flex flex-col gap-2.5 mt-5">
        {published.map((t) => (
          <Link
            key={t}
            href={`/guide/spreads/${buildSpreadSlug(t)}`}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3.5 border border-lilac-soft hover:border-lilac-deep/40 transition"
          >
            <p className="text-[14px] font-bold text-eye-purple">
              {SPREAD_INFO[t].label}{" "}
              <span className="text-[11.5px] font-normal text-text-light">
                {SPREAD_INFO[t].cardCount}장
              </span>
            </p>
            <p className="text-[11.5px] text-text-light mt-0.5 leading-snug">
              {SPREAD_INFO[t].tagline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
