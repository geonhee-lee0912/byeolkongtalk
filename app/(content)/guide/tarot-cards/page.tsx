import type { Metadata } from "next";
import Link from "next/link";
import cardContent from "@/data/seo/card-content.json";
import { getAllTarotCards } from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";

export const metadata: Metadata = {
  title: "타로 카드 의미 도감 — 78장 정방향·역방향",
  description:
    "메이저 아르카나 22장과 마이너 아르카나 56장의 의미를 연애 맥락으로 풀어낸 별콩이의 타로 도감.",
  alternates: { canonical: "/guide/tarot-cards" },
};

const CONTENT = cardContent as Record<string, unknown>;

const GROUPS: { title: string; from: number; to: number }[] = [
  { title: "메이저 아르카나", from: 0, to: 21 },
  { title: "완드 (불)", from: 22, to: 35 },
  { title: "컵 (물)", from: 36, to: 49 },
  { title: "소드 (바람)", from: 50, to: 63 },
  { title: "펜타클 (흙)", from: 64, to: 77 },
];

export default function TarotCardsIndex() {
  const published = getAllTarotCards().filter(
    (c) => buildCardSlug(c) in CONTENT
  );

  return (
    <div>
      <h1 className="font-display text-[22px] text-eye-purple">
        타로 카드 의미 도감
      </h1>
      <p className="text-[12.5px] text-text-light mt-1.5 leading-relaxed">
        78장의 카드가 연애에서 어떤 결을 보여주는지, 별콩이가 한 장씩
        풀어놨어.
      </p>

      {published.length === 0 ? (
        <p className="text-[12.5px] text-text-light mt-6 leading-relaxed">
          카드 풀이는 지금 한 장씩 쓰고 있어. 먼저{" "}
          <Link href="/free/daily-card" className="font-bold text-lilac-deep">
            오늘의 카드
          </Link>
          를 뽑아볼래?
        </p>
      ) : (
        GROUPS.map((g) => {
          const cards = published.filter(
            (c) => c.id >= g.from && c.id <= g.to
          );
          if (cards.length === 0) return null;
          return (
            <section key={g.title} className="mt-6">
              <h2 className="text-[14px] font-bold text-eye-purple mb-2">
                {g.title}
              </h2>
              <div className="flex flex-wrap gap-2">
                {cards.map((c) => (
                  <Link
                    key={c.id}
                    href={`/guide/tarot-cards/${buildCardSlug(c)}`}
                    className="text-[12px] font-bold text-lilac-deep bg-white/80 border border-lilac-soft rounded-full px-3 py-1.5 hover:border-lilac-deep/40 transition"
                  >
                    {c.name_kr}
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
