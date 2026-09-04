// components/byeolmaru/CrossSellCard.tsx — 별콩이 추천(자사 크로스셀). 하단 브라우즈 존.
"use client";
import Link from "next/link";
import type { CrossSell } from "@/lib/byeolmaru/crosssell";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function CrossSellCard({ item }: { item: CrossSell }) {
  return (
    <section className="rounded-2xl bg-cream-warm p-4">
      <div className="mb-1 flex items-center gap-1 text-xs text-lilac-deep">
        <span aria-hidden>✨</span> 별콩이 추천
      </div>
      <h2 className="mb-1 font-display text-base text-eye-purple">{item.title}</h2>
      <p className="mb-3 text-sm text-text-light">{item.desc}</p>
      <Link
        href={item.href}
        onClick={() => trackUiEvent("byeolmaru_crosssell_clicked", { meta: { product: item.product } })}
        className="inline-block rounded-xl bg-lilac-deep px-4 py-2 text-sm text-cream"
      >
        보러 가기
      </Link>
    </section>
  );
}
